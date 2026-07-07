/*******************************************************************************
 * ARCHIVO: cuda.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Controlador responsable de gestionar el flujo de ejecución de código.       *
 * Intercepta las solicitudes web, valida saldos, orquesta la creación del     *
 * entorno de pruebas aislado (Sandbox) y despacha los trabajos a la cola.     *
 *******************************************************************************/

// 1. Módulos nativos de Node.js
import fs from 'fs/promises';                                       // API nativa de promesas para interactuar asíncronamente con el disco
import path from 'path';                                            // Módulo nativo para construir y normalizar rutas físicas del sistema

// 2. Librerías de terceros y tipos externos
import type { Response } from 'express';                            // Tipo nativo de Express para las respuestas HTTP
import type { ResultSetHeader, RowDataPacket } from 'mysql2';       // Tipado estricto para validar resultados de consultas SQL

// 3. Tipos e interfaces propias
import type { AuthRequest } from '../types/express.js';             // Interfaz extendida que contiene el payload del JWT

// 4. Configuración y utilidades del sistema
import pool from '../config/db.config.js';                          // Pool de conexiones reutilizable hacia la base de datos MySQL
import { workspaceUtil } from '../utils/workspace.util.js';         // Gestor central de creación y destrucción de entornos aislados

// 5. Servicios de la plataforma
import { queueService } from '../services/queue.service.js';        // Servicio orquestador de colas de procesamiento asíncrono


export const cudaController = {
    
    /*
     * Intercepta el código enviado desde el frontend y prepara la ejecución
     * Evalúa el saldo del usuario, inyecta dependencias en un entorno aislado
     * físico y delega la tarea al motor de encolado de BullMQ
     */
    async executeCode(req: AuthRequest, res: Response): Promise<void> {

        // Ruta del workspace temporal asociada a esta ejecución
        // Se declara fuera del try para poder limpiar recursos en caso de error
        let workspacePath = '';

        try {

            // Extrae el ID del usuario autenticado desde el JWT
            const userId = req.user?.userId;

            // Extrae el rol actual del usuario autenticado
            const userRole = req.user?.role;

            // Recupera el código fuente enviado desde el frontend
            const sourceCode = req.body.code;

            // Barrera de seguridad inicial verificando identidad
            if (!userId) {
                res.status(401).json({ status: 'error', message: 'No autorizado o Token inválido' });
                return;
            }

            // Bloquea intentos de ejecución en blanco ahorrando recursos de servidor
            if (!sourceCode) {
                res.status(400).json({ status: 'error', message: 'No se ha proporcionado código fuente' });
                return;
            }

            // Prioridad por defecto para alumnos normales
            // En BullMQ un número menor significa mayor prioridad
            let jobPriority = 10;

            /*******************************************************************
            * PRIORIDADES Y CONTROL DE TOKENS
            *******************************************************************/

            // Los administradores tienen máxima prioridad absoluta
            if (userRole === 'admin') {
                jobPriority = 1;

            } else {

                // Un alumno solo puede tener una tarea viva simultáneamente
                const [activeTasks] = await pool.query<RowDataPacket[]>(
                    "SELECT id FROM tasks WHERE user_id = ? AND status IN ('pending', 'processing')", 
                    [userId]
                );
                
                
                // Si existe una tarea viva se bloquea la nueva ejecución
                if (activeTasks.length > 0) {

                    // HTTP 429 = Too Many Requests
                    res.status(429).json({ status: 'error', message: 'Ya tienes una tarea en ejecución o en cola. Espera a que termine.' });

                    return;
                }
                    

                /***************************************************************
                * SISTEMA DE TOKENS
                ***************************************************************/

                // Obtiene el saldo actual de tokens del usuario
                const [users] = await pool.query<RowDataPacket[]>('SELECT tokens FROM users WHERE id = ?', [userId]);

                // Extrae el valor numérico de tokens
                const tokens = users[0].tokens;

                // Si el alumno tiene tokens disponibles
                if (tokens > 0) {
                    
                    // Se descuenta automáticamente 1 token
                    await pool.query('UPDATE users SET tokens = tokens - 1 WHERE id = ?', [userId]);

                    // Mantiene prioridad estándar
                    jobPriority = 10;

                // Si no tiene tokens disponibles
                } else {

                    // El sistema permite ejecutar pero degradando la prioridad
                    jobPriority = 20;
                }
            }

            /*******************************************************************
            * PREPARACIÓN DEL ENTORNO AISLADO (SANDBOX)
            *******************************************************************/
            
            // Nombre estándar del archivo principal
            const sourceFileName = 'main.cu';

            // Obtiene todos los archivos privados del alumno
            const [userFiles] = await pool.query('SELECT * FROM files WHERE user_id = ? AND is_global = FALSE', [userId]);

            // Obtiene todos los archivos globales
            const [globalFiles] = await pool.query('SELECT * FROM files WHERE is_global = TRUE');

            // Crea el Sandbox inyectando todos los archivos privados y globales
            // Usa Hard Links para optimizar espacio y velocidad
            const { workspacePath: wPath, injectedFiles } = await workspaceUtil.createHybridWorkspace(
                userId, 
                userFiles as any[], 
                globalFiles as any[]
            );

            // Guarda la ruta
            workspacePath = wPath;

            // Escribe el texto plano del código fuente en disco físico aislado
            await fs.writeFile(path.join(workspacePath, sourceFileName), sourceCode);


            /*******************************************************************
            * REGISTRO DE LA TAREA EN BASE DE DATOS
            *******************************************************************/
            
            // Se crea primero la tarea en base de datos antes de enviarla
            // Esto hace que la base de datos sea la fuente de verdad principal
            const [dbResult] = await pool.query<ResultSetHeader>(
                "INSERT INTO tasks (user_id, status, file_path, source_code) VALUES (?, 'pending', ?, ?)",
                [userId, workspacePath, sourceCode]
            );

            // ID autogenerado de la nueva tarea
            const taskId = dbResult.insertId;


            /*******************************************************************
            * ENVÍO DE LA TAREA A BULLMQ / REDIS
            *******************************************************************/

            // Empuja el paquete de la tarea completo a la cola
            await queueService.addJob({ 

                // ID único persistente de la tarea
                taskId, 

                // Ruta física del sandbox temporal
                workspacePath, 

                // Archivo CUDA principal
                sourceFileName,

                // Propietario de la tarea
                userId,
                
                // Redis no puede serializar objetos Map directamente
                // Se convierte a array [clave, valor]
                injectedFiles: Array.from(injectedFiles.entries()) 

            }, jobPriority);

            // Mensaje de éxito
            res.status(202).json({
                status: 'success',

                // Mensaje dinámico según prioridad aplicada
                message: jobPriority === 20 
                    ? 'Tarea encolada con baja prioridad (Sin tokens)' 
                    : 'Tarea encolada correctamente',

                // Información útil para el Frontend
                data: { taskId, status: 'pending', priority: jobPriority }
            });

        } catch (error: any) {

            // Si el workspace se crea pero algo falla se destruye
            if (workspacePath) await workspaceUtil.cleanupWorkspace(workspacePath);

            // Error interno del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Consulta el estado actual de una tarea CUDA
     * Permite consulta activa segura desde el Frontend verificando permisos
     * y devolviendo stdout, stderr y estado de ejecución
     */
    async getTaskStatus(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID de la tarea solicitado desde la URL
            const taskId = req.params.taskId;

            // Usuario autenticado actual
            const userId = req.user?.userId;

            // Rol del usuario autenticado
            const userRole = req.user?.role;

            // Consulta de la tarea en la base de datos
            const [tasks] = await pool.query<RowDataPacket[]>(
                'SELECT id, user_id, status, stdout, stderr, created_at FROM tasks WHERE id = ?',
                [taskId]
            );

            // La tarea debe existir
            if (tasks.length === 0) {
                res.status(404).json({ status: 'error', message: 'Tarea no encontrada' });
                return;
            }

            // Extrae la tarea encontrada
            const task = tasks[0];

            // Los alumnos normales solo pueden consultar sus tareas
            if (userRole === 'normal' && task.user_id !== userId) {
                res.status(403).json({ status: 'error', message: 'No tienes permiso para ver esta tarea' });
                return;
            }

            // Éxito
            res.status(200).json({
                status: 'success',
                data: task
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Cancela una tarea activa o pendiente del sistema
     * Permite abortar trabajos tanto en cola como en ejecución GPU
     * Implementa validación de permisos, devolución automática de tokens
     * y limpieza física de workspaces temporales
     */
    async cancelTask(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID de la tarea solicitado desde la URL
            const taskId = Number(req.params.taskId);

            // Identidad y privilegios del usuario autenticado
            const userId = req.user?.userId;
            const userRole = req.user?.role;

            // Verifica existencia y recuperación de datos críticos
            // file_path es necesario para poder destruir el workspace físico
            const [tasks] = await pool.query<RowDataPacket[]>(
                'SELECT user_id, status, file_path FROM tasks WHERE id = ?', 
                [taskId]
            );
            
            // La tarea no existe en base de datos
            if (tasks.length === 0) {
                res.status(404).json({ status: 'error', message: 'Tarea no encontrada' });
                return;
            }

            // Referencia al resultado encontrado
            const task = tasks[0];

            // Un alumno normal no puede manipular tareas ajenas
            if (userRole === 'normal' && task.user_id !== userId) {
                res.status(403).json({ status: 'error', message: 'No puedes cancelar tareas de otros usuarios' });
                return;
            }

            // Impide cancelar tareas ya finalizadas
            if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
                res.status(400).json({ status: 'error', message: `La tarea ya ha finalizado con estado: ${task.status}` });
                return;
            }

            /*******************************************************************
            * SI LA TAREA ESTÁ EN PENDIENTE
            *******************************************************************/
            if (task.status === 'pending') {
                
                // Importación dinámica de la cola
                const { cudaQueue } = await import('../services/queue.service.js');

                // Recupera la tarea exacta usando el ID
                const job = await cudaQueue.getJob(`task-${taskId}`);
                
                // Verifica que el trabajo siga realmente en Redis/BullMQ
                if (job) {

                    // Guarda la prioridad original antes de eliminar
                    const jobPriority = job.opts.priority;

                    // Elimina físicamente de la cola
                    await job.remove();
                    
                    // Actualiza el estado en la base de datos
                    await pool.query("UPDATE tasks SET status = 'cancelled' WHERE id = ?", [taskId]);
                    
                    // Devuelve el token si la tarea 
                    // gastó un token (tiene prioridad 10)
                    if (jobPriority === 10) {
                        await pool.query('UPDATE users SET tokens = tokens + 1 WHERE id = ?', [task.user_id]);
                    }

                    // Limpieza del workspace temporal
                    // El Worker no llegará a ejecutarse, y debe borrarse aquí
                    if (task.file_path) {
                        await workspaceUtil.cleanupWorkspace(task.file_path);
                    }

                    // Respuesta de cancelación exitosa
                    res.status(200).json({ status: 'success', message: 'Tarea eliminada de la cola. Estado actualizado.' });
                    return;
                }
            }

            /*******************************************************************
            * SI LA TAREA SE ESTÁ EJECUTANDO EN GPU
            *******************************************************************/
            if (task.status === 'processing') {

                // Registro global de ejecuciones activas en memoria RAM
                const { activeExecutions } = await import('../utils/task-registry.util.js');

                // Recupera el AbortController asociado a la tarea
                const abortController = activeExecutions.get(taskId);

                // Si existe controlador activo, se fuerza el aborto
                if (abortController) {

                    // Dispara señal AbortSignal hacia el proceso CUDA
                    abortController.abort();

                    // Confirmación de señal enviada
                    res.status(200).json({ status: 'success', message: 'Señal de aborto enviada a la GPU.' });

                    return;
                }
            }

            // Fallo de sincronización entre base de datos, Redis y memoria
            res.status(500).json({ status: 'error', message: 'No se pudo cancelar la tarea en su estado actual.' });

        } catch (error: any) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Recupera automáticamente una tarea activa del usuario
     * Permite restaurar el estado tras recargar la página o reconectar
     * Busca tareas pendientes o actualmente ejecutándose
     */
    async getActiveTask(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado actual
            const userId = req.user?.userId;

            // Validación de sesión autenticada
            if (!userId) {
                res.status(401).json({ status: 'error', message: 'No autorizado' });
                return;
            }

            // Busca la tarea viva más reciente (pending o processing)
            const [tasks] = await pool.query<RowDataPacket[]>(
                "SELECT id, status FROM tasks WHERE user_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT 1",
                [userId]
            );

            // Existe una tarea todavía activa
            if (tasks.length > 0) {
                
                // Devuelve identificador y estado actual
                res.status(200).json({ 
                    status: 'success', 
                    data: { taskId: tasks[0].id, status: tasks[0].status } 
                });

            } else {
                
                // El usuario no tiene tareas vivas actualmente
                res.status(200).json({ 
                    status: 'success', 
                    data: null 
                });
            }

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Recupera la última ejecución histórica del usuario
     * Permite mostrar manualmente el resultado más reciente en la terminal
     * Incluye stdout, stderr, estado y fecha de ejecución
     */
    async getLastExecution(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Usuario autenticado actual
            const userId = req.user?.userId;

            // Validación de autenticación
            if (!userId) {
                res.status(401).json({ status: 'error', message: 'No autorizado' });
                return;
            }

            // Recupera última ejecución registrada
            // No importa si terminó bien, falló o fue cancelada
            const [tasks] = await pool.query<RowDataPacket[]>(
                "SELECT id, status, stdout, stderr, created_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
                [userId]
            );

            // Existe al menos una ejecución en historial
            if (tasks.length > 0) {

                // Devuelve la fila completa
                res.status(200).json({ 
                    status: 'success', 
                    data: tasks[0]
                });

            // Historial vacío
            } else {
                
                res.status(404).json({ 
                    status: 'error', 
                    message: 'No tienes ninguna ejecución registrada en el historial.' 
                });
            }

        } catch (error: any) {
            
            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    }
};