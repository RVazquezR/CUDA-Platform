/*******************************************************************************
 * ARCHIVO: upload.middleware.ts                                               *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Configura el motor Multer para la subida y recepción de archivos.           *
 * Gestiona la creación del almacenamiento temporal y aplica un escudo físico  *
 * para evitar la saturación del disco antes de la validación lógica de cuotas.*
 *******************************************************************************/

import path from 'path';        // Módulo nativo para extraer extensiones y normalizar rutas
import fs from 'fs';            // Módulo nativo para interactuar con el disco físico y crear directorios
import multer from 'multer';    // Middleware para manejar peticiones multipart/form-data

// Determina la ruta absoluta de la carpeta temporal (Aduana de archivos)
const tempDir = path.join(process.cwd(), 'storage', 'temp');

// Crea el directorio físico si no existe en el arranque evitando errores de escritura
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

/*
 * Configuración del almacenamiento en disco
 * Define dónde y con qué nombre temporal se guardan los archivos
 */
const storage = multer.diskStorage({
    // Asigna la carpeta temporal previamente verificada
    destination: (req, file, cb) => cb(null, tempDir),

    // Genera un nombre único para evitar colisiones entre archivos
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'temp_' + uniqueSuffix + path.extname(file.originalname));
    }
});

/*
 * Middleware exportado para interceptar peticiones entrantes
 * Se encarga de procesar un único archivo llamado 'file' aplicando restricciones
 */
export const uploadMiddleware = {
    single: multer({ 
        storage: storage,
        
        // Escudo físico preventivo
        // Protege el disco duro de archivos masivos (DoS) antes de que la BD 'file.service.ts' verifique la cuota
        // Se establece en 500MB asumiendo que es el máximo absoluto manejable por el servidor
        limits: { fileSize: 500 * 1024 * 1024 }
    }).single('file')
};