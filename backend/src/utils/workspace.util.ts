/*******************************************************************************
 * ARCHIVO: workspace.util.ts                                                  *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Utilidad centralizada para la gestión de entornos temporales de ejecución   *
 * aislados (Sandboxes).                                                       *
 * Se encarga de:                                                              *
 *  - crear workspaces aislados                                                *
 *  - inyectar archivos de usuario/globales                                    *
 *  - detectar sobrescrituras                                                  *
 *  - cosechar archivos generados                                              *
 *  - aplicar cuotas de almacenamiento                                         *
 *  - limpiar recursos temporales                                              *
 *******************************************************************************/

import fs from 'fs/promises';                       // API de promesas nativa para interactuar asíncronamente con el sistema de archivos
import path from 'path';                            // Módulo para manejar y normalizar rutas de archivos
import { logger } from '../utils/logger.util.js';   // Registrar actividad del servidor en logs
import { randomUUID } from 'crypto';                // Generador de identificadores únicos universales
import { storageUtil } from './storage.util.js';    // Utilidad para resolución de rutas de almacenamiento

// Extensiones residuales generadas por el compilador que no deben almacenarse
const IGNORED_EXTENSIONS = ['.exe', '.lib', '.exp', '.obj', '.pdb', '.ilk', '.cu', '.cpp'];

export const workspaceUtil = {
    
    /*
     * Construye un entorno de ejecución aislado, efímero y seguro (Sandbox)
     * Inyecta los archivos personales y globales requeridos para la compilación
     * mediante copia física para evitar corrupción de datos
     */
    async createHybridWorkspace(userId: number, userFiles: any[], globalFiles: any[]): Promise<{ workspacePath: string, injectedFiles: Map<string, number> }> {

        // UUID único para aislar completamente cada ejecución
        const workspaceId = randomUUID();

        // Ruta física temporal del sandbox
        const workspacePath = path.join(process.cwd(), 'temp_workspaces', workspaceId); 

        // Crea físicamente la carpeta temporal
        await fs.mkdir(workspacePath, { recursive: true });

        // Mapa en memoria para enlazar nombre del archivo y su tiempo de creación
        // Así el recolector sabe si el archivo fue modificado por la GPU
        const injectedFiles = new Map<string, number>();

        /*
         * Función interna encargada de copiar archivos al sandbox
         * de forma segura y controlada
         */
        const copyFilesSecurely = async (files: any[], isGlobal: boolean) => {

            for (const file of files) {
                
                // Si un archivo en la carpeta personal del alumno tiene
                // el mismo nombre que uno global, el suyo tiene prioridad y se
                // ignora el global tiene un archivo con el mismo nombre
                if (injectedFiles.has(file.original_name)) {
                    logger.info(`[Sandbox] Colisión evitada: El archivo local '${file.original_name}' tiene prioridad sobre el global.`);
                    continue; 
                }

                // Ruta física original del archivo persistente
                const sourcePath = storageUtil.getFilePath(file.stored_name, userId, isGlobal);

                // Ruta destino dentro del sandbox temporal
                const destPath = path.join(workspacePath, file.original_name);
                
                try {

                    // Usa copyFile (no fs.link()) crea una copia física independiente
                    // Evita modificar archivos globales
                    await fs.copyFile(sourcePath, destPath);
                    
                    // Recuperamos metadatos físicos del archivo copiado
                    const stat = await fs.stat(destPath);
                    
                    // Guardam firma temporal de última modificación del archivo
                    injectedFiles.set(file.original_name, stat.mtimeMs);
                    
                    logger.info(`[Sandbox] Archivo inyectado (Copia segura): ${file.original_name}`);

                } catch (copyError) {

                    logger.error(`[Sandbox] Fallo crítico inyectando: ${file.original_name}`, copyError);
                }
            }
        };

        // 1º Inyecta los archivos del alumno (máxima prioridad)
        await copyFilesSecurely(userFiles, false);
        // 2º Inyecta los archivos globales (Solo si el nombre no está ocupado)
        await copyFilesSecurely(globalFiles, true);

        // Devuelve la ruta absoluta y el registro temporal para el controlador
        return { workspacePath, injectedFiles };
    },

    /*
     * Escanea el entorno aislado tras la ejecución del código en la GPU
     * Filtra la basura del compilador, detecta nuevos archivos o modificaciones
     * y los mueve al directorio del usuario respetando su cuota máxima de disco
     */
    async harvestWorkspace(workspacePath: string, injectedFilesMap: Map<string, number>, userId: number, availableQuotaBytes: number): Promise<{ files: any[], warnings: string[] }> {
        
        // Listado completo actual del workspace
        const currentFiles = await fs.readdir(workspacePath);

        // Archivos válidos detectados
        const harvestedFiles = [];

        // Advertencias generadas durante la cosecha
        const warnings: string[] = [];

        // Tamaño acumulado para control de cuota
        let accumulatedSize = 0;

        for (const file of currentFiles) {

            const fileExt = path.extname(file).toLowerCase();

            /*******************************************************************
             * FILTRO 1: BASURA DEL COMPILADOR
             ******************************************************************/
            
            // Ignora binarios, temporales y código fuente
            if (file === 'main.cu' || IGNORED_EXTENSIONS.includes(fileExt)) continue;

            const sourcePath = path.join(workspacePath, file);

            // Recuperamos metadatos físicos
            const stat = await fs.stat(sourcePath);

            /*******************************************************************
             * FILTRO 2: DETECCIÓN DE SOBRESCRITURAS
             ******************************************************************/

            // Compara firma temporal actual y la guardada al inyectar el archivo
            if (injectedFilesMap.has(file)) {

                const originalMtime = injectedFilesMap.get(file)!;

                // Si no cambia se ignora
                if (stat.mtimeMs <= originalMtime) continue; 

                logger.info(`[Sandbox] Sobrescritura detectada en '${file}'.`);
            }

            /*******************************************************************
             * FILTRO 3: VALIDACIÓN FINAL Y CUOTA
             ******************************************************************/

            // Si sobrevive a los filtros, verifica si es un archivo
            if (stat.isFile()) {
                
                // Control estricto de cuota de almacenamiento
                if (accumulatedSize + stat.size > availableQuotaBytes) {
                    
                    const warningMsg = `[Cuota Excedida] El archivo '${file}' (${(stat.size/1024/1024).toFixed(2)} MB) ha sido descartado por falta de espacio disponible.`;
                    
                    // Almacena en los logs del servidor
                    logger.warn(`[Sandbox] ${warningMsg}`); 
                    warnings.push(warningMsg);

                    // Ignora archivo, no se guarda en carpeta del usuario
                    continue;
                }
                
                // Acumula tamaño total
                accumulatedSize += stat.size;

                // Nombre físico interno aleatorio
                const storedName = `${randomUUID()}${fileExt}`;

                // Carpeta privada del usuario
                const userFolderPath = path.join(storageUtil.USERS_STORAGE_PATH, userId.toString());
                
                // Garantiza existencia de la carpeta
                await fs.mkdir(userFolderPath, { recursive: true });

                // Ruta final
                const destPath = path.join(userFolderPath, storedName);

                // Mueve físicamente el archivo fuera del sandbox
                await fs.rename(sourcePath, destPath);

                // Registra metadatos persistentes
                harvestedFiles.push({
                    original_name: file,
                    stored_name: storedName,
                    size_bytes: stat.size
                });
            }
        }
        
        // Retorna el empaquetado estructurado
        // Archivos válidos cosechados
        // Advertencias detectadas
        return { files: harvestedFiles, warnings };
    },

    /*
     * Elimina completamente el sandbox temporal tras finalizar la ejecución
     */
    async cleanupWorkspace(workspacePath: string): Promise<void> {
        try {

            // En Windows, si nvcc o el antivirus mantienen bloqueado un arcivo,
            // Node.js no fallará
            // Espera 1 segundo y lo reintenta hasta 5 veces
            await fs.rm(workspacePath, { 
                recursive: true, 
                force: true,

                // Reintentos automáticos si da error EBUSY
                maxRetries: 5,

                // Espera 1 segundo entre intentos
                retryDelay: 1000
            });
            
            logger.info(`[Sandbox] Entorno temporal limpiado: ${path.basename(workspacePath)}`);

        } catch (error) {

            logger.error(`[Sandbox] Error irrecuperable limpiando workspace ${workspacePath}:`, error);
        }
    }
};