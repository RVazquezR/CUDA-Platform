/*******************************************************************************
 * ARCHIVO: admin.controller.ts                                                *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Controlador central para el panel de administración.                        *
 * Contiene la lógica de negocio privilegiada para gestionar usuarios, alterar *
 * el comportamiento de la cola de procesamiento, manipular archivos globales  *
 * y modificar la configuración del sistema en tiempo de ejecución.            *
 *******************************************************************************/

// 1. Módulos nativos de Node.js
import fs from 'fs/promises';                                   // API de promesas nativa para interactuar asíncronamente con el sistema de archivos
import path from 'path';                                        // Módulo para construir y normalizar rutas físicas del sistema

// 2. Librerías de terceros
import type { Response } from 'express';                        // Tipo nativo de Express para las respuestas HTTP
import type { RowDataPacket, ResultSetHeader } from 'mysql2';   // Tipos oficiales de mysql2 para tipado seguro SQL

// 3. Tipos e interfaces propias
import type { AuthRequest } from '../types/express.js';         // Interfaz extendida que contiene el payload del JWT

// 4. Configuración y utilidades del sistema
import pool from '../config/db.config.js';                      // Pool de conexiones reutilizable hacia la base de datos MySQL
import { logger } from '../utils/logger.util.js';               // Registrar actividad del servidor en logs
import { storageUtil } from '../utils/storage.util.js';         // Utilidad para la resolución de rutas de almacenamiento
import { workspaceUtil } from '../utils/workspace.util.js';     // Gestor de creación y destrucción de sandbox

// 5. Servicios de la plataforma y worker
import { fileService } from '../services/file.service.js';      // Servicio de almacenamiento y gestión de archivos
import { socketService } from '../services/socket.service.js';  // Motor de notificaciones push en tiempo real hacia el navegador
import { cudaQueue } from '../services/queue.service.js';       // Cola principal BullMQ usada para las ejecuciones CUDA
import { cudaWorker } from '../workers/cuda.worker.js';         // Worker CUDA para modificar concurrencia en caliente


export const adminController = {

    /***************************************************************************
     * GESTIÓN DE USUARIOS Y SALDOS
     **************************************************************************/

    /*
     * Modifica el saldo de tokens de un alumno específico
     * Permite añadir, restar o establecer una cantidad específica
     * También incluye validaciones defensivas ante cantidades inválidas, tokens
     * negativos, acciones no soportadas o si es una cuenta admin
     */
    async updateTokens(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID del alumno objetivo obtenido desde la URL
            const studentId = req.params.studentId;

            // Datos enviados por el administrador
            const { action, amount } = req.body;

            // Valida que la cantidad sea un número real
            if (typeof amount !== 'number') {
                res.status(400).json({ status: 'error', message: 'La cantidad debe ser un número válido' });
                return;
            }

            // Para sumar o restar cantidades positivas
            if ((action === 'add' || action === 'remove') && amount <= 0) {
                res.status(400).json({ status: 'error', message: 'Para sumar o restar, la cantidad debe ser estrictamente mayor que 0' });
                return;
            }

            // Para set números negativos no se permiten
            if (action === 'set' && amount < 0) {
                res.status(400).json({ status: 'error', message: 'No puedes establecer un número de tokens negativo' });
                return;
            }
            
            // Contrucción dinámica de la consulta SQL
            let query = '';
            
            // Sumar tokens
            if (action === 'add') {
                query = 'UPDATE users SET tokens = tokens + ? WHERE id = ? AND role = "normal"';

            // Restar tokens
            } else if (action === 'remove') {
                // Greatest evita tokens por debajo de 0
                query = 'UPDATE users SET tokens = GREATEST(0, tokens - ?) WHERE id = ? AND role = "normal"';

            // Establecer cantidad exacta
            } else if (action === 'set') {
                query = 'UPDATE users SET tokens = ? WHERE id = ? AND role = "normal"';
            
            // Acción inválida
            } else {
                res.status(400).json({ status: 'error', message: 'Acción no válida. Usa add, remove o set' });
                return;
            }

            // Ejecución SQL
            const [result] = await pool.query<ResultSetHeader>(query, [amount, studentId]);

            // Si no hay filas afectadas, usuario no existe o rol no es normal
            if (result.affectedRows === 0) {
                res.status(404).json({ status: 'error', message: 'Alumno no encontrado o no es un usuario normal' });
                return;
            }

            // Respuesta exitosa
            res.status(200).json({ status: 'success', message: `Tokens actualizados correctamente para el alumno #${studentId}` });

        // Fallos inesperados (fallos SQL, conexión o errores internos)
        } catch (error: any) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Devuelve la lista completa de usuarios registrados
     * Excluye intencionadamente las contraseñas hasheadas y ordena por fecha
     * de creación descendente
     */
    async getAllUsers(req: AuthRequest, res: Response): Promise<void> {
        try {
            
            // Consulta SQL
            const [users] = await pool.query<RowDataPacket[]>(
                'SELECT id, name, email, role, tokens, last_token_renewal, created_at, is_active, password_reset_requested FROM users ORDER BY created_at DESC'
            );

            // Normalización de booleano para Angular (true o false)
            const safeUsers = users.map(user => ({
                ...user,
                is_active: user.is_active === 1 || user.is_active === true,
                password_reset_requested: user.password_reset_requested === 1 || user.password_reset_requested === true
                
            }));

            // Éxito
            res.status(200).json({
                status: 'success',
                data: safeUsers
            });
        
        // Error
        } catch (error: any) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Modifica los datos de cualquier usuario de forma controlada y segura
     * Permite cambio de nombre, email, rol y activación o suspensión. 
     * Implementa bloqueos defensivos de protección auto suspensión, anti 
     * pérdida de privilegios y prevención de duplicados
     */
    async updateUser(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID del alumno objetivo obtenido desde la URL
            const targetUserId = req.params.userId as string;

            // Extrae exclusivamente los campos permitidos
            const { name, email, role, password, tokens, is_active, ...otrosCampos } = req.body;

            // Bloquea la petición si detecta parámetros protegidos o no reconocidos
            if (password || tokens !== undefined || Object.keys(otrosCampos).length > 0) {
                res.status(400).json({ 
                    status: 'error', 
                    message: 'Endpoint estricto. Solo se permite enviar name, email, role o is_active.' 
                });
                return;
            }

            // Evita procesar peticiones vacías que gastarían recursos de red
            if (!name && !email && !role && is_active === undefined) {
                res.status(400).json({ status: 'error', message: 'No hay datos para actualizar' });
                return;
            }

            // Barreras de seguridad y tipado estricto para estado de la cuenta
            if (is_active !== undefined) {
                if (typeof is_active !== 'boolean') {
                    res.status(400).json({ status: 'error', message: 'El campo is_active debe ser true o false' });
                    return;
                }
                
                // Evitar que el admin se suspenda a sí mismo
                if (is_active === false && parseInt(targetUserId, 10) === req.user?.userId) {
                    res.status(400).json({ status: 'error', message: 'No puedes suspender tu propia cuenta de administrador.' });
                    return;
                }
            }

            // Si intenta cambiar el email verifica que no exista ya
            if (email) {
                const [existing] = await pool.query<RowDataPacket[]>(
                    'SELECT id FROM users WHERE email = ? AND id != ?', 
                    [email, targetUserId]
                );
                if (existing.length > 0) {
                    res.status(409).json({ status: 'error', message: 'Ese correo electrónico ya está en uso por otro usuario' });
                    return;
                }
            }

            // Construcción dinámica de la consulta con los campos presentes
            let query = 'UPDATE users SET ';
            const queryParams: any[] = [];

            // Actualización del nombre
            if (name) { query += 'name = ?, '; queryParams.push(name); }

            // Actualización del email
            if (email) { query += 'email = ?, '; queryParams.push(email); }

            // Actualización del rol
            if (role) { 

                // Validación estricta de los roles que están permitidos
                if(role !== 'admin' && role !== 'normal') {
                    res.status(400).json({ status: 'error', message: 'Rol inválido. Debe ser normal o admin' });
                    return;
                }

                // Un admin no puede rebajar sus propios privilegios
                // Evita que el sistema se quede huérfano de administradores
                if (role === 'normal' && parseInt(targetUserId, 10) === req.user?.userId) {
                    res.status(403).json({ 
                        status: 'error', 
                        message: 'Seguridad: No puedes rebajar tu propio rol de administrador. Otro administrador debe hacerlo.' 
                    });
                    return;
                }
                query += 'role = ?, '; queryParams.push(role); 
            }

            // Actualización del estado de activación
            if (is_active !== undefined) {

                // Adapta el booleano al estándar numérico de MySQL (1,0)
                query += 'is_active = ?, '; queryParams.push(is_active ? 1 : 0);
            }

            // Limpia la coma final sobrante y añade la cláusula WHERE
            query = query.slice(0, -2) + ' WHERE id = ?';
            queryParams.push(targetUserId);

            // Ejecuta la actualización
            const [result] = await pool.query<ResultSetHeader>(query, queryParams);

            // Si no hay filas afectadas el usuario no existe
            if (result.affectedRows === 0) {
                res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
                return;
            }

            // Respuesta exitosa
            res.status(200).json({ status: 'success', message: 'Usuario modificado correctamente por el administrador' });

        } catch (error: any) {

             // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Elimina completamente un usuario del sistema
     * Borra la cuenta, archivos, tareas y su almacenamiento físico
     * Implementa limpieza física, transacciones ACID revirtiendo los cambios
     * si algo falla y protección contra la auto eliminación
     */
    async deleteUser(req: AuthRequest, res: Response): Promise<void> {

        // Conexión exclusiva para transacciones SQL
        let connection;

        try {

            // ID del usuario a eliminar
            const targetUserId = req.params.userId;
            
            // Un administrador no puede eliminar su propia cuenta
            if (Number(targetUserId) === req.user?.userId) {
                res.status(403).json({ status: 'error', message: 'No puedes eliminar tu propia cuenta.' });
                return;
            }

            // Fase 1: Destrucción Física del almacenamiento privado
            const userFolderPath = path.join(storageUtil.USERS_STORAGE_PATH, targetUserId.toString());

            try {

                // recursive: elimina subdirectorios
                // maxRetries fuerza el borrado anti bloqueo de Windows
                await fs.rm(userFolderPath, { recursive: true, force: true, maxRetries: 3 });

            } catch (fsError) {

                // No detenemos el flujo porque la carpeta puede no existir
                logger.warn(`[Admin] La carpeta del usuario ${targetUserId} no existía o no pudo borrarse.`);
            }

            // Fase 2: Limpieza Lógica en Cascada (Transacción ACID)
            // Pide una conexión exclusiva del pool
            connection = await pool.getConnection();

            // Inicia la transacción
            await connection.beginTransaction();

            // Elimina archivos del usuario
            await connection.query('DELETE FROM files WHERE user_id = ?', [targetUserId]);

            // Eliminael histórico de las tareas
            await connection.query('DELETE FROM tasks WHERE user_id = ?', [targetUserId]);

            // Finalmene elimina la cuenta del usuario
            const [result] = await connection.query<ResultSetHeader>('DELETE FROM users WHERE id = ?', [targetUserId]);

            // Si no existe el usuario se revierte todo
            if (result.affectedRows === 0) {
                await connection.rollback();
                res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
                return;
            }

            // Confirma definitivamente todos los cambios
            await connection.commit();

            // Respuesta exitosa
            res.status(200).json({ status: 'success', message: `Usuario #${targetUserId} y su almacenamiento eliminados.` });

        } catch (error: any) {

            // Si ocurre cualquier error SQL se revierten todos los cambios
            if (connection) await connection.rollback();
            res.status(500).json({ status: 'error', message: error.message });

        } finally {

            // Devuelve conexión al pool evitando fugas de conexiones
            if (connection) connection.release();
        }
    },

    /*
     * Reset de Curso para eliminar todas las cuentas con rol 'normal'
     * Implementa eliminación masiva optimizada, transacciones ACID y limpieza 
     * física
     * Diseñada para reinicios de cursos o una limpieza completa
     */
    async deleteAllStudents(req: AuthRequest, res: Response): Promise<void> {

        // Conexión exclusiva para transacciones SQL
        let connection;
        try {

            // Extrae exclusivamente los id de los alumnos sin tocar los admin
            const [students] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE role = "normal"');
            
            // Si no se obtiene resultado es porque no hay alumnos a eliminar
            if (students.length === 0) {
                res.status(200).json({ status: 'success', message: 'No hay estudiantes para eliminar.' });
                return;
            }

            // Extrae únicamente los id
            const studentIds = students.map(s => s.id);

            // Fase 1: Limpieza física masiva eliminando todas las carpetas
            let deletedFolders = 0;
            for (const id of studentIds) {
                const userFolderPath = path.join(storageUtil.USERS_STORAGE_PATH, id.toString());
                try {
                    await fs.rm(userFolderPath, { recursive: true, force: true, maxRetries: 3 });
                    deletedFolders++;
                } catch (e) { 
                    //* Ignora si el alumno no había subido ningún archivo
                }
            }

            // Fase 2: Eliminación lógica masiva (Transacción ACID)
            // Pide una conexión exclusiva del pool
            connection = await pool.getConnection();

            // Inicia la transacción
            await connection.beginTransaction();

            // Elimina todos los archivos asociados
            await connection.query('DELETE FROM files WHERE user_id IN (?)', [studentIds]);

            // Elimina todas las tareas históricas
            await connection.query('DELETE FROM tasks WHERE user_id IN (?)', [studentIds]);

            // Elimina todas las cuentas de estudiantes
            await connection.query('DELETE FROM users WHERE id IN (?)', [studentIds]);

            // Confirma todos los cambios definitivamente
            await connection.commit();

            // Mensaje final de éxito
            res.status(200).json({ 
                status: 'success', 
                message: `Reset de curso completado: ${studentIds.length} cuentas eliminadas y ${deletedFolders} carpetas de almacenamiento destruidas.` 
            });

        } catch (error: any) {

            // Si algo falla se revierten todos los cambios
            if (connection) await connection.rollback();
            res.status(500).json({ status: 'error', message: error.message });

        } finally {

            // Liberamos la conexión del pool
            if (connection) connection.release();
        }
    },

    /*
     * Suspende o reactiva la cuenta de un usuario en el sistema
     * Bloquea el acceso sin borrar ninguno de sus datos ni archivos
     * Incluye protección defensiva para evitar la auto-suspensión del admin
     */
    async toggleUserStatus(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Compatibilidad defensiva: Permite rutas usando :id o :userId
            const targetUserId = req.params.userId || req.params.id; 

            // Estado objetivo enviado por el administrador
            const { is_active } = req.body;

            // Validación estricta del ID
            if (!targetUserId) {
                res.status(400).json({ status: 'error', message: 'Falta el ID del usuario en la ruta.' });
                return;
            }

            // Validación estricta del tipo booleano
            if (typeof is_active !== 'boolean') {
                res.status(400).json({ status: 'error', message: 'El campo is_active debe ser un booleano (true o false)' });
                return;
            }

            // Evita que el admin se suspenda a sí mismo accidentalmente
            if (is_active === false && parseInt(targetUserId as string, 10) === req.user?.userId) {
                res.status(403).json({ status: 'error', message: 'Seguridad: No puedes suspender tu propia cuenta de administrador.' });
                return;
            }

            // Actualización del estado de la cuenta
            // Conversión automática true y false a 1 y 0
            const [result] = await pool.query<ResultSetHeader>(
                "UPDATE users SET is_active = ? WHERE id = ?",
                [is_active ? 1 : 0, targetUserId]
            );

            // Si no hubo filas afectadas el usuario no existe
            if (result.affectedRows === 0) {
                res.status(404).json({ status: 'error', message: 'Usuario no encontrado para cambiar estado.' });
                return;
            }

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `La cuenta ha sido ${is_active ? 'activada' : 'suspendida'} correctamente.`
            });

        } catch (error: any) {

            // Registro interno del error
            logger.error("[Admin] Error cambiando estado del usuario:", error);

            // Error genérico seguro para el cliente
            res.status(500).json({ status: 'error', message: 'Error interno del servidor al cambiar el estado.' });
        }
    },

    /*
     * Genera una contraseña temporal de un solo uso para un usuario
     * Fuerza el cambio obligatorio de contraseña en el siguiente login
     * y limpia automáticamente el estado de solicitud de recuperación
     */
    async forcePasswordReset(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID del usuario objetivo obtenido desde la URL
            const userId = req.params.userId;

            // Generación de PIN aleatorio de 4 dígitos (desde 1000 hasta 9999)
            const randomPin = Math.floor(1000 + Math.random() * 9000).toString();

            // Construcción de contraseña temporal
            const tempPassword = `CudaTemp#${randomPin}`;

            // Importación dinámica de bcrypt
            // Reduce consumo de memoria al cargarlo solo cuando es necesario
            const bcrypt = await import('bcrypt');

            // Hash seguro de la contraseña temporal
            const passwordHash = await bcrypt.hash(tempPassword, 10);

            // Actualización integral del estado de recuperación:
            // 1. Sustituye la contraseña actual
            // 2. Obliga al usuario a cambiarla al iniciar sesión
            // 3. Limpia el indicador de solicitud de reseteo
            await pool.query(
                `UPDATE users SET 
                    password_hash = ?, 
                    force_password_change = 1, 
                    password_reset_requested = 0 
                 WHERE id = ?`,
                [passwordHash, userId]
            );

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: 'Contraseña reseteada con éxito.',
                data: { tempPassword }
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },


    /***************************************************************************
     * GESTIÓN DE LA COLA DE TRABAJOS (BULLMQ)
     **************************************************************************/

    /*
     * Pausa la ejecución de la cola de procesamiento
     * Detiene la extracción de nuevos trabajos pero permite que el Worker
     * finalice de forma segura cualquier tarea que ya tenga en la GPU
     * Las tareas encoladas esperan su reanudación y notifica el evento
     * a todos los clientes conectados mediante WebSockets
     */
    async pauseQueue(req: AuthRequest, res: Response): Promise<void> {
        try {
            
            // Suspende temporalmente la ingesta de la cola
            await cudaQueue.pause();

            // Persiste el estado de pausa en MySQL (Operación UPSERT)
            // Insertar si no existe o actualizar si existe
            await pool.query(`
                INSERT INTO system_settings (setting_key, setting_value) 
                VALUES ('queue_status', 'paused') 
                ON DUPLICATE KEY UPDATE setting_value = 'paused'
            `);

            // Emite una alerta global a todos los navegadores conectados
            socketService.broadcast('queue_paused', { 
                message: 'El administrador ha PAUSADO la cola. Las tareas en espera no se procesarán hasta nuevo aviso.' 
            });

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: 'La cola ha sido PAUSADA. El Worker terminará la tarea actual (si la hay) y se detendrá.' 
            });

        } catch (error: any) {

             // Error inesperado
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Reanuda globalmente el procesamiento de tareas reactivando consumo de
     * trabajos pendientes
     * Persiste el nuevo estado del sistema y comunica el evento con todos
     * los clientes conectados mediante WebSockets
     */
    async resumeQueue(req: AuthRequest, res: Response): Promise<void> {
        try {
            
            // Libera el bloqueo en Redis permitiendo al Worker extraer trabajos
            await cudaQueue.resume();

            // Persiste el estado de reanudación en MySQL (Operación UPSERT)
            // Insertar si no existe o actualizar si existe
            await pool.query(`
                INSERT INTO system_settings (setting_key, setting_value) 
                VALUES ('queue_status', 'running') 
                ON DUPLICATE KEY UPDATE setting_value = 'running'
            `);

            // Notifica a los usuarios que el flujo ha vuelto a la normalidad
            socketService.broadcast('queue_resumed', { 
                message: 'El administrador ha REANUDADO la cola. El procesamiento continúa.' 
            });

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: 'La cola ha sido REANUDADA. El Worker volverá a procesar las tareas pendientes.' 
            });
        
        // Error inesperado
        } catch (error: any) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Vacía completamente la cola eliminando las tareas pendientes del sistema
     * Se sincroniza Redis, se devuelven los tokens, limpia workspaces 
     * temporales y notifica individualmente a cada alumno afectado
     */
    async clearQueue(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Obtiene todas las tareas pendientes desde MySQL
            // file_path es necesario para destruir físicamente el workspace
            const [pendingTasks] = await pool.query<RowDataPacket[]>(
                "SELECT id, user_id, file_path FROM tasks WHERE status = 'pending'"
            );

            // Si no existen tareas pendientes sincronizamos Redis igualmente
            if (pendingTasks.length === 0) {
                
                // Limpieza defensiva de posibles residuos
                await cudaQueue.drain();

                // Respuesta exitosa sin operaciones adicionales
                res.status(200).json({ status: 'success', message: 'No hay tareas pendientes en la base de datos. Cola sincronizada.' });
                return;
            }

            // Recorre todas las tareas pendientes registradas
            for (const task of pendingTasks) {
                
                // Fase 1: Marcar tarea como cancelada en la base de datos
                await pool.query(
                    "UPDATE tasks SET status = 'cancelled', stderr = 'Cancelada masivamente por el administrador.' WHERE id = ?", 
                    [task.id]
                );
                
                // Fase 2: Reembolso automático del token a usuarios normales
                await pool.query(
                    "UPDATE users SET tokens = tokens + 1 WHERE id = ? AND role = 'normal'", 
                    [task.user_id]
                );

                // Fase 3: Busca el trabajo en BullMQ por su ID y lo destruye
                const job = await cudaQueue.getJob(`task-${task.id}`);
                if (job) {
                    await job.remove();
                }

                // Fase 4: Limpieza física del sandbox temporal
                if (task.file_path) {
                    await workspaceUtil.cleanupWorkspace(task.file_path);
                }

                // Fase 5: Notifica al alumno de forma privada para que su 
                // pantalla de carga se detenga
                socketService.notifyUser(task.user_id, 'task_completed', {

                    // Identificador de la tarea cancelada
                    taskId: task.id,

                    // Estado final
                    status: 'cancelled',

                    // No existe salida estándar
                    stdout: '',

                    // Mensaje visible para el alumno
                    stderr: 'Tu tarea ha sido cancelada masivamente por un Administrador. Se te ha devuelto el token.'
                });

            }

            // Barrido final de seguridad sobre BullMQ
            // Garantiza que Redis quede completamente sincronizado
            await cudaQueue.drain();

            // Respuesta final exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `Emergencia completada: Se han cancelado ${pendingTasks.length} tareas y se han devuelto los tokens.` 
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },


    /***************************************************************************
     * GESTIÓN DE ARCHIVOS GLOBALES
     **************************************************************************/

    /*
     * Sube un archivo global compartido para todos los alumnos
     * El archivo queda almacenado en la zona global
     * Intercepta la carga física y delega el registro al fileService
     */
    async uploadGlobal(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Archivo recibido
            const file = req.file;

            // Aborta si no se inyectó ningún archivo
            if (!file) {
                res.status(400).json({ status: 'error', message: 'No se ha subido ningún archivo' });
                return;
            }

            // Delegación completa al servicio de archivos
            const fileId = await fileService.uploadGlobalFile(file);

            // Respuesta exitosa
            res.status(201).json({ status: 'success', message: 'Archivo global subido', data: { fileId } });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Elimina un archivo global compartido del sistema
     * Borra tanto el registro lógico como el archivo físico asociado
     */
    async deleteGlobal(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Conversión segura del parámetro recibido por URL
            const fileId = parseInt(req.params.fileId as string, 10);

            // Delegación de la destrucción al servicio de archivos
            await fileService.deleteGlobalFile(fileId);

            // Respuesta exitosa
            res.status(200).json({ status: 'success', message: 'Archivo global eliminado' });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },


    /***************************************************************************
     * MÉTRICAS
     **************************************************************************/

    /*
     * Obtiene métricas globales para el panel de administración
     * Incluye estadísticas de usuarios, archivos, tareas agrupadas
     * y actividad reciente del sistema
     */
    async getDashboardMetrics(req: AuthRequest, res: Response): Promise<void> {
        try {
            
            // Métrica 1: Número total de alumnos registrados
            const [usersResult] = await pool.query<RowDataPacket[]>(
                "SELECT COUNT(*) as total FROM users WHERE role = 'normal'"
            );
            const totalUsers = usersResult[0].total;

            // Métrica 2: Número total de archivos almacenados
            const [filesResult] = await pool.query<RowDataPacket[]>(
                "SELECT COUNT(*) as total FROM files"
            );
            const totalFiles = filesResult[0].total;

            // Métrica 3: Conteo de tareas según el estado de ejcución
            const [tasksResult] = await pool.query<RowDataPacket[]>(
                "SELECT status, COUNT(*) as count FROM tasks GROUP BY status"
            );
            
            // Mapeo para asegurar que todos los estados existan en la respuesta 
            // del frontend
            const tasksSummary: Record<string, number> = {

                // Tareas finalizadas correctamente
                completed: 0, 

                // Tareas con error
                failed: 0, 

                // Tareas canceladas
                cancelled: 0, 

                // Tareas esperando en cola
                pending: 0, 

                // Tareas actualmente ejecutándose
                processing: 0
            };
            
            // Inyecta los recuentos reales obtenidos
            tasksResult.forEach(row => {
                tasksSummary[row.status] = row.count;
            });

            // Métrica 4: Historial reciente de actividad
            const [recentTasks] = await pool.query<RowDataPacket[]>(
                `SELECT t.id, t.status, t.created_at, u.name 
                 FROM tasks t 
                 JOIN users u ON t.user_id = u.id 
                 ORDER BY t.created_at DESC LIMIT 50`
            );

            // Respuesta final empaquetada
            res.status(200).json({
                status: 'success',
                data: {

                    // Resumen global
                    overview: {

                        // Total de alumnos
                        totalUsers,

                        // Total de archivos
                        totalFiles,

                        // Total de tareas
                        totalTasks: Object.values(tasksSummary).reduce((a, b) => a + b, 0)
                    },

                    // Estadísticas agrupadas por estado
                    tasksByStatus: tasksSummary,

                    // Últimas ejecuciones registradas
                    recentActivity: recentTasks
                }
            });

        } catch (error: any) {

            // Log interno de fallo para diagnóstico
            logger.error("[Admin Metrics] Error obteniendo métricas:", error);

            // Error genérico seguro para el cliente
            res.status(500).json({ status: 'error', message: 'Error interno obteniendo métricas' });
        }
    },

    /***************************************************************************
     * AUDITORÍA Y SEGURIDAD
     **************************************************************************/

    /*
     * Recupera el código fuente original enviado por un alumno en una tarea
     */
    async getTaskCode(req: AuthRequest, res: Response): Promise<void> {
        try {

            // ID de la tarea solicitado desde la URL
            const taskId = req.params.taskId;

            // Extrae exclusivamente la columna source_code
            const [tasks] = await pool.query<RowDataPacket[]>(
                "SELECT source_code FROM tasks WHERE id = ?",
                [taskId]
            );

            // Verifica si la tarea existe en la base de datos
            if (tasks.length === 0) {
                res.status(404).json({ status: 'error', message: 'Tarea no encontrada.' });
                return;
            }

            // Respuesta exitosa con el código
            res.status(200).json({
                status: 'success',
                data: {
                    source_code: tasks[0].source_code || 'El código no está disponible para esta ejecución.'
                }
            });

        } catch (error: any) {
            
            // Registro interno para diagnóstico
            logger.error("[Admin Audit] Error obteniendo código fuente:", error);
            
            // Error genérico seguro para el cliente
            res.status(500).json({ status: 'error', message: 'Error interno obteniendo el código fuente.' });
        }
    },


    /***************************************************************************
     * MANTENIMIENTO FÍSICO DEL SISTEMA
     **************************************************************************/

    /*
     * Ejecuta una limpieza masiva del almacenamiento de alumnos
     * Elimina sus archivos de la base de datos y destruye físicamente el 
     * contenido de storage/users
     * Conserva intactos los archivos globales del sistema
     */
    async systemFileCleanup(req: AuthRequest, res: Response): Promise<void> {
        try {
            
            // Fase 1: Limpieza de archivos no globales en base de datos
            const [result] = await pool.query<ResultSetHeader>('DELETE FROM files WHERE is_global = FALSE');

            // Si no hay archivos para eliminar finaliza
            if (result.affectedRows === 0) {
                res.status(200).json({ status: 'success', message: 'El disco ya estaba limpio. No hay archivos de alumnos.' });
                return;
            }

            // Fase 2: Limpieza física de storage/users/
            const usersDir = storageUtil.USERS_STORAGE_PATH;
            
            try {
                
                // Obtiene todas las carpetas de usuario existentes
                const folders = await fs.readdir(usersDir);

                // Recorre cada carpeta individualmente
                for (const folder of folders) {

                    // Ruta absoluta del directorio del usuario
                    const folderPath = path.join(usersDir, folder);

                    // Obtención de metadatos del sistema de archivos
                    const stat = await fs.stat(folderPath);
                    
                    // Solo actúa sobre directorios reales
                    if (stat.isDirectory()) {

                        // Borra la carpeta entera del usuario y su contenido
                        await fs.rm(folderPath, { recursive: true, force: true, maxRetries: 3 });
                        
                        // Recrea vacía la carpeta para no evitar fallos
                        await fs.mkdir(folderPath, { recursive: true });
                    }
                }

            } catch (fsError) {

                // Error físico: La BD ya quedó limpia aunque el disco falle
                // No interrumpe la respuesta final
                logger.error("[Admin] Error durante la limpieza física de archivos:", fsError);
            }

            // Respuesta final exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `Mantenimiento completado: Se han eliminado ${result.affectedRows} archivos residuales y liberado el espacio en disco.` 
            });

        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    
    /***************************************************************************
     * CONFIGURACIÓN DEL SISTEMA
     **************************************************************************/
    
    /*
     * Obtiene toda la configuración global almacenada del sistema
     * Transforma la estructura de la base de datos en un objeto clave-valor
     */
    async getSystemSettings(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Consulta completa de todas las claves de configuración
            const [rows] = await pool.query<RowDataPacket[]>('SELECT setting_key, setting_value FROM system_settings');
            
            // Convierte de array SQL a objeto clave valor
            // { registration_enabled: "true", execution_timeout: "30000" }
            const settings: Record<string, string> = {};
            rows.forEach(row => {
                settings[row.setting_key] = row.setting_value;
            });

            // Respuesta exitosa con todas las configuraciones
            res.status(200).json({ status: 'success', data: settings });

        } catch (error: any) {

            // Error interno del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Habilita o bloquea el registro de nuevos usuarios en el sistema
     * Persiste el estado en la tabla de configuración global del sistema
     */
    async toggleRegistrationStatus(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Estado objetivo enviado por el administrador
            const { enable } = req.body;

            // Validación estricta del booleano
            if (typeof enable !== 'boolean') {
                res.status(400).json({ status: 'error', message: 'El campo enable debe ser un booleano (true/false).' });
                return;
            }

            // Conversión a string para persistencia en base de datos
            const stringValue = enable ? 'true' : 'false';

            // Persistencia mediante UPSERT
            // Inserta si no existe o actualiza si ya existe
            const query = `
                INSERT INTO system_settings (setting_key, setting_value) 
                VALUES ('registration_enabled', ?) 
                ON DUPLICATE KEY UPDATE setting_value = ?
            `;
            await pool.query(query, [stringValue, stringValue]);

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `El registro de nuevos usuarios ha sido ${enable ? 'HABILITADO' : 'CERRADO'} correctamente.`
            });

        } catch (error: any) {

            // Registro interno de errores
            logger.error("[Admin] Error cambiando estado de los registros:", error);

            // Error genérico seguro
            res.status(500).json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },

    /*
     * Actualiza el tiempo máximo permitido para ejecutar tareas
     * Protege el sistema frente a ejecuciones infinitas o bloqueos
     * Persiste el estado en la tabla de configuración global del sistema
     */
    async updateExecutionTimeout(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Tiempo máximo recibido desde el panel administrativo
            const { timeout_ms } = req.body;

            // Evita timeouts bajos que romperían ejecuciones válidas
            if (typeof timeout_ms !== 'number' || timeout_ms < 5000) {
                res.status(400).json({ status: 'error', message: 'El tiempo de ejecución debe ser al menos de 5000 ms (5 segundo).' });
                return;
            }

            // Persistencia mediante UPSERT
            // Inserta si no existe o actualiza si ya existe
            const query = `
                INSERT INTO system_settings (setting_key, setting_value) 
                VALUES ('execution_timeout', ?) 
                ON DUPLICATE KEY UPDATE setting_value = ?
            `;
            await pool.query(query, [timeout_ms.toString(), timeout_ms.toString()]);

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `Tiempo máximo de ejecución actualizado a ${timeout_ms / 1000} segundos.` 
            });

        } catch (error: any) {

            // Error interno inesperado
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Determina el límite máximo de almacenamiento permitido por usuario
     * Persiste el estado en la tabla de configuración global del sistema
     * Se utiliza para controlar consumo de disco y evitar saturación
     */
    async updateStorageQuota(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Cuota recibida desde el panel de administración
            const { quota_mb } = req.body;

            // Impide valores inválidos o negativos
            if (typeof quota_mb !== 'number' || quota_mb < 1) {
                res.status(400).json({ status: 'error', message: 'La cuota debe ser de al menos 1 MB.' });
                return;
            }

            // Persistencia mediante UPSERT
            // Inserta si no existe o actualiza si ya existe
            const query = `
                INSERT INTO system_settings (setting_key, setting_value) 
                VALUES ('storage_quota_mb', ?) 
                ON DUPLICATE KEY UPDATE setting_value = ?
            `;
            await pool.query(query, [quota_mb.toString(), quota_mb.toString()]);

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `Límite de almacenamiento actualizado a ${quota_mb} MB por usuario.` 
            });

        } catch (error: any) {

            // Error interno inesperado
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Actualiza el número máximo de tareas concurrentes del Worker
     * Persiste el estado en la tabla de configuración global del sistema y
     * actualización en caliente sin tener que reiniciar el servidor
     */
    async updateWorkerConcurrency(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Nivel de concurrencia solicitado por el administrador
            const { concurrency } = req.body;

            // Limita el paralelismo para evitar sobrecarga
            if (typeof concurrency !== 'number' || concurrency < 1 || concurrency > 4) {
                res.status(400).json({ status: 'error', message: 'La concurrencia debe ser un número entre 1 y 4.' });
                return;
            }

            // Persistencia mediante UPSERT
            // Inserta si no existe o actualiza si ya existe
            const query = `
                INSERT INTO system_settings (setting_key, setting_value) 
                VALUES ('worker_concurrency', ?) 
                ON DUPLICATE KEY UPDATE setting_value = ?
            `;
            await pool.query(query, [concurrency.toString(), concurrency.toString()]);

            // Aplica el nuevo límite instantáneamente sobre BullMQ
            // No reinicia el Worker y no pierde tareas activas
            if (cudaWorker) {
                cudaWorker.concurrency = concurrency;
            }

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `Concurrencia actualizada a ${concurrency} procesos paralelos.` 
            });

        } catch (error: any) {

            // Error interno inesperado
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Configura el sistema automático de renovación diaria de tokens
     * Guarda la hora y cantidad asignada. Además, actualiza dinámicamente el 
     * Cron Service sin reiniciar el servidor
     */
    async updateTokenResetSettings(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Hora programada y cantidad de tokens recibidos
            const { time, amount } = req.body;

            // Validación estricta del formato horario HH:mm
            if (!time || !/^\d{2}:\d{2}$/.test(time)) {
                res.status(400).json({ status: 'error', message: 'La hora debe tener formato HH:mm (ej. 00:00).' });
                return;
            }

            // Validación de cantidad de tokens
            if (typeof amount !== 'number' || amount < 0) {
                res.status(400).json({ status: 'error', message: 'La cantidad de tokens debe ser un número válido.' });
                return;
            }

            // Persistencia mediante UPSERT
            // Inserta si no existe o actualiza si ya existe
            await pool.query(
                `INSERT INTO system_settings (setting_key, setting_value) VALUES ('token_reset_time', ?) ON DUPLICATE KEY UPDATE setting_value = ?`,
                [time, time]
            );
            await pool.query(
                `INSERT INTO system_settings (setting_key, setting_value) VALUES ('token_reset_amount', ?) ON DUPLICATE KEY UPDATE setting_value = ?`,
                [amount.toString(), amount.toString()]
            );

            // Importación dinámica para destruir y recrear el temporizador
            const { cronService } = await import('../services/cron.service.js');

            // Reprograma instantáneamente la tarea automática
            cronService.scheduleJob(time, amount);

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `La renovación automática se ejecutará a las ${time} asignando ${amount} tokens.` 
            });
            
        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    },

    /*
     * Actualiza la duración máxima de las sesiones JWT
     * Permite controlar el tiempo de autenticación persistente
     * de los usuarios antes de requerir nuevo inicio de sesión
     */
    async updateTokenExpiration(req: AuthRequest, res: Response): Promise<void> {
        try {

            // Duración de sesión recibida en horas
            const { hours } = req.body;

            // Rango permitido: 1 hora hasta 4500 horas (6 meses)
            if (typeof hours !== 'number' || hours < 1 || hours > 4500) {
                res.status(400).json({ status: 'error', message: 'La duración debe estar entre 1 y 4500 horas.' });
                return;
            }

            // Persistencia mediante UPSERT
            // Inserta si no existe o actualiza si ya existe
            const query = `
                INSERT INTO system_settings (setting_key, setting_value) 
                VALUES ('token_expiration_hours', ?) 
                ON DUPLICATE KEY UPDATE setting_value = ?
            `;
            await pool.query(query, [hours.toString(), hours.toString()]);

            // Respuesta exitosa
            res.status(200).json({ 
                status: 'success', 
                message: `La sesión de los usuarios caducará ahora a las ${hours} horas de inactividad. Los usuarios actuales deben volver a iniciar sesión para aplicar el cambio.` 
            });
        } catch (error: any) {

            // Error inesperado del servidor
            res.status(500).json({ status: 'error', message: error.message });
        }
    }

};