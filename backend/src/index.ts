/*******************************************************************************
 * ARCHIVO: index.ts                                                           *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Punto de entrada principal del backend.                                     *
 * Orquesta la inicialización de la infraestructura del sistema:               *
 * - Servidor HTTP Express                                                     *
 * - WebSockets en tiempo real                                                 *
 * - Middleware globales                                                       *
 * - Sistema de rutas                                                          *
 * - Conexión con MySQL                                                        *
 * - Conexión con Redis                                                        *
 * - Inicialización de almacenamiento                                          *
 * - Arranque del Worker CUDA                                                  *
 * - Sistema de tareas programadas                                             *
 *                                                                             *
 * También implementa mecanismos defensivos de seguridad como CORS,            *
 * Rate limiting global y gestión centralizada de errores HTTP.                *
 *******************************************************************************/

// 1. Módulos nativos de Node.js
import { createServer } from 'http';

// 2. Librerías de terceros y tipos externos
import express, { type Request, type Response, type Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// 3. Configuración y conectividad
import { testDbConnection } from './config/db.config.js';
import { testRedisConnection } from './config/redis.config.js';

// 4. Utilidades del sistema
import { storageUtil } from './utils/storage.util.js';
import { logger } from './utils/logger.util.js';

// 5. Middlewares de seguridad
import { globalLimiter } from './middlewares/rate-limit.middleware.js';

// 6. Servicios de la plataforma
import { cronService } from './services/cron.service.js';
import { socketService } from './services/socket.service.js';

// 7. Enrutadores
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import cudaRoutes from './routes/cuda.routes.js';
import adminRoutes from './routes/admin.routes.js';
import fileRoutes from './routes/file.routes.js';

// 8. Worker CUDA
// La importación despierta el Worker, registra en memoria y conecta a BullMQ
import './workers/cuda.worker.js';



// Carga las variables del archivo .env dentro de process.env
dotenv.config();

// Instancia principal de Express
const app: Application = express();

// Puerto HTTP del servidor
// Si no existe en .env se usa 3000 por defecto
const PORT = process.env.PORT || 3000;

// URL permitida para el frontend
// Se usa en CORS para bloquear peticiones externas no autorizadas
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

// Instancia del servidor HTTP nativo inyectando Express
// Esto es obligatorio para poder integrar Socket.IO sobre Express
const httpServer = createServer(app);



/* =============================================================================
 * CONFIGURACIÓN DE SEGURIDAD GLOBAL
 * =============================================================================
 */

// Middleware CORS
// Solo permite conexiones desde el frontend
app.use(cors({

    // Dominio autorizado
    origin: FRONTEND_URL,

    // Permite cookies, cabeceras de autorización y credenciales JWT
    credentials: true,

    // Métodos HTTP permitidos por la API
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));

// Middleware Anti DDoS
// Aplica Rate Limit a todas las rutas por defecto
// Mitiga ataques de denegación de servicio (DDoS) y peticiones masivas
app.use(globalLimiter);

// Middleware JSON
// Permite que Express entienda cuerpos JSON en req.body
app.use(express.json()); 


/* =============================================================================
 * RUTA DE MONITORIZACIÓN Y HEALTH CHECK
 * =============================================================================
 */

// Endpoint público de comprobación de estado
app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'success',
        message: '¡La API de CUDA PLATFORM está funcionando correctamente!',
        timestamp: new Date().toISOString()
    });
});

/* ============================================================================
 * REGISTRO Y MANEJO DE RUTAS
 * ============================================================================
 */

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de usuario
app.use('/api/users', userRoutes);

// Rutas de ejecución
app.use('/api/cuda', cudaRoutes);

// Rutas admin
app.use('/api/admin', adminRoutes);

// Rutas de archivos
app.use('/api/files', fileRoutes);

// Ruta por defecto para manejar URL no encontrada (404)
app.use((req: Request, res: Response) => {
    res.status(404).json({
        status: 'error',
        message: 'Ruta no encontrada'
    });
});


/* =============================================================================
 * INICIALIZACIÓN DE WEBSOCKETS
 * =============================================================================
 */

// Conecta Socket.IO al servidor HTTP principal
// Debe ejecutarse ANTES del listen()
socketService.initialize(httpServer);

/* =============================================================================
 * ARRANQUE PRINCIPAL DEL SERVIDOR
 * =============================================================================
 */

// Función asíncrona de arranque seguro del sistema verificando dependencias
const startServer = async () => {
    try {
        
        // Verifica conectividad con MySQL
        await testDbConnection();

        // Verifica conectividad con Redis/BullMQ
        await testRedisConnection();

        // Verifica integridad de la estructura física de carpetas
        await storageUtil.initStorage();

        // Arranca el sistema de cron
        cronService.startJobs();

        // Inicia el servidor y abre las puertas lógicas a conexiones entrantes
        httpServer.listen(PORT, () => {

            // Log principal de arranque
            logger.info(`[SISTEMA] Servidor HTTP y WebSockets corriendo en http://localhost:${PORT}`);

            // Log del endpoint de monitorización
            logger.info(`[SISTEMA] Health check disponible en http://localhost:${PORT}/api/health`);
        });

    } catch (error) {

        // Error crítico durante el arranque
        logger.error('[SISTEMA] Error fatal durante el arranque del servidor:', error);

        // Finaliza el proceso evitando dejar el sistema arrancado parcialmente
        process.exit(1);
    }
};

// Punto de entrada real del sistema
startServer();