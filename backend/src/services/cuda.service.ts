/*******************************************************************************
 * ARCHIVO: cuda.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Motor de interacción con el hardware (GPU). Invoca al compilador NVCC de    *
 * NVIDIA y ejecuta los binarios resultantes aislando los procesos del sistema *
 * principal y controlando los límites de tiempo.                              *
 *******************************************************************************/

import { exec } from 'child_process';               // Permite ejecutar comandos de la terminal desde Node.js
import util from 'util';                            // Transforma funciones de callback nativas en promesas
import path from 'path';                            // Módulo para manejar y normalizar rutas de archivos
import { logger } from '../utils/logger.util.js';   // Registrar actividad del servidor en logs
import pool from '../config/db.config.js';          // Pool de conexiones reutilizable hacia la base de datos
import type { RowDataPacket } from 'mysql2';        // Tipos de mysql2 para tipar filas y resultados SQL

// Convertimos la función exec basada en callbacks a una basada en Promesas (async/await)
// Esto facilita el manejo de errores y los límites de tiempo
const execPromise = util.promisify(exec);

export const cudaService = {

    /*
     * Compila y ejecuta el código CUDA dentro de un workspace aislado
     * Maneja el ciclo de vida del proceso hijo, controla compilación, 
     * ejecución, cancelaciones, timeouts y saneamiento de errores
     */
    async compileAndRun(
        workspacePath: string, 
        sourceFileName: string, 
        signal?: AbortSignal

    ): Promise<{ stdout: string, stderr: string, isCancelled: boolean }> {

        // Extrae el identificador UUID único de la carpeta temporal
        const workspaceId = path.basename(workspacePath);

        // Creaa un ejecutable con nombre único
        // Previene colisiones de archivos binarios si varias tareas se compilan a la vez
        const exeName = `cuda_${workspaceId}.exe`; 

        // Tiempo máximo de ejecución por defecto
        let EXECUTION_TIMEOUT_MS = 30000;

        try {

            // Recupera el timeout dinámico desde la configuración del sistema
            const [settings] = await pool.query<RowDataPacket[]>(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'execution_timeout'"
            );

            // Sobrescribe el timeout si existe configuración válida
            if (settings.length > 0) {
                EXECUTION_TIMEOUT_MS = parseInt(settings[0].setting_value, 10);
            }

        } catch (dbError) {
            // Usa el valor por defecto si falla la lectura desde base de datos
            logger.error('[CudaService] No se pudo leer el timeout de la BD. Usando 30s por defecto.');
        }

        try {

            /*******************************************************************
             * FASE 1: FASE DE COMPILACION
             ******************************************************************/
            // Se usa 'cwd', y no es necesario poner rutas absolutas largas
            // NVCC busca 'sourceFileName' en 'workspacePath' y deja 'exeName' 
            // en 'workspacePath'

            // Construye el comando NVCC para compilar el archivo fuente
            const compileCommand = `nvcc "${sourceFileName}" -o "${exeName}"`;
            
            // Ejecuta la compilación dentro del workspace temporal aislado
            await execPromise(compileCommand, { 
                signal,

                // La compilación ocurre dentro de la carpeta temporal
                cwd: workspacePath
            });

            /*******************************************************************
             * FASE 2: FASE DE EJECUCIÓN
             ******************************************************************/
            // Ejecuta el binario compilado dentro del workspace temporal
            // Se usa .\ para referirse al ejecutable local
            const runCommand = `.\\${exeName}`;

            const { stdout, stderr } = await execPromise(runCommand, {

                // Fuerza la finalización si supera el tiempo permitido
                timeout: EXECUTION_TIMEOUT_MS,

                // Permite cancelar el proceso desde el exterior
                signal,

                // Ejecuta el proceso dentro del workspace aislado
                cwd: workspacePath
            });

            // Devuelve la salida estándar y errores generados por el programa
            return { stdout, stderr, isCancelled: false };

        } catch (error: any) {

            /*******************************************************************
             * FASE DE DETECCIÓN Y LIMPIEZA DE PROCESOS
             ******************************************************************/

            try {

                // Fuerza destrucción del ejecutable y sus procesos hijos
                // - /F Fuerza la terminación del proceso aunque este bloqueado o no responda
                // - /T Finaliza procesos hijos del ejecutable principal
                // - /IM Indica el proceso se busca por nombre del ejecutable
                await execPromise(`taskkill /F /T /IM "${exeName}"`);
                logger.info(`[Francotirador] Proceso ${exeName} y sus hijos eliminados con éxito.`);

            } catch (killError) {
                // Ignora errores si el proceso ya había finalizado
            }

            /*******************************************************************
             * SALIDA DEL SISTEMA Y SANITIZADOR DE ERRORES
             ******************************************************************/
            const sanitize = (text: string) => {

                // Evita procesar cadenas vacías o nulas
                if (!text) return '';
                return text

                    // Divide el texto línea por línea
                    .split('\n')

                    // Elimina mensajes internos de exec de Node.js
                    .filter(line => !line.includes('Command failed:'))

                    // Elimina referencias temporales internas generadas por NVCC
                    .filter(line => !line.includes('tmpxft_'))

                    // Elimina mensajes internos del linker de Windows
                    .filter(line => 
                        !line.includes('Creando biblioteca') && 
                        !line.includes('Creating library')
                    )

                    // Reconstruye el texto limpio
                    .join('\n')
                    
                    // Oculta UUIDs internos de ejecutables temporales
                    .replace(/cuda_[a-fA-F0-9\-]+\.(exe|lib|exp)/g, 'main.$1')

                    // Limpia espacios sobrantes
                    .trim();
            };

            /*******************************************************************
             * CASO 1: CANCELACIÓN MANUAL DEL USUARIO
             ******************************************************************/
            if (error.name === 'AbortError') {

                // Espera breve para asegurar limpieza completa del proceso
                await new Promise(resolve => setTimeout(resolve, 500));
                return { 
                    stdout: '', 
                    stderr: 'Ejecución cancelada por el usuario o administrador.', 
                    isCancelled: true 
                };
            }

            /*******************************************************************
             * CASO 2: TIMEOUT DE SEGURIDAD
             ******************************************************************/
            if (error.killed) {

                // Convierte milisegundos a segundos para mostrarlo al usuario
                const timeoutSeconds = EXECUTION_TIMEOUT_MS / 1000;

                return { 
                    stdout: '', 

                    // Devuelve salida parcial junto al mensaje de timeout
                    stderr: sanitize(error.stdout) + `\nError Crítico: Tiempo de ejecución máximo (${timeoutSeconds}s) superado. El proceso fue aniquilado por seguridad.`, 
                    
                    isCancelled: false 
                };
            }

            /*******************************************************************
             * CASO 3: ERROR DE COMPILACIÓN O EJECUCIÓN
             ******************************************************************/

            // Recupera stdout y stderr generados por NVCC o el binario
            let rawStdout = error.stdout || '';
            let rawStderr = error.stderr || '';

            // Usa el mensaje principal del error si no existe salida previa
            if (!rawStderr && !rawStdout && error.message) {
                rawStderr = error.message;
            }

            // Unifica stdout en stderr para tratarlos como un único error
            const combinedError = `${rawStdout}\n${rawStderr}`.trim();

            return {

                // No existe salida válida si se alcanzó el catch
                stdout: '',

                // Devuelve el error completamente sanitizado
                stderr: sanitize(combinedError),
                isCancelled: false
            };
        }
    }
};