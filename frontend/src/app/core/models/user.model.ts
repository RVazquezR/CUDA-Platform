/*******************************************************************************
 * ARCHIVO: user.model.ts                                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Define de las interfaces y estructuras de datos utilizadas en el lado del   *
 * cliente (Frontend) para garantizar un tipado estricto al intercambiar       *
 * información con la API REST, evitando errores de compilación y asegurando   *
 *******************************************************************************/

/*
 * Representa la entidad principal de un usuario dentro de la plataforma.
 * Refleja la estructura exacta de los datos devueltos por la base de datos
 * y gestionados durante el ciclo de vida de la sesión en Angular
 */
export interface User {
    id: number;                         // Identificador único del usuario en el sistema
    name: string;                       // Nombre completo del usuario
    email: string;                      // Dirección de correo utilizada como credencial de acceso
    role: 'normal' | 'admin';           // Nivel de privilegios asignado a la cuenta
    is_active: boolean;                 // Bandera que indica si la cuenta está activada o suspendida
    tokens: number;                     // Saldo de cuotas de ejecución disponibles
    last_token_renewal?: string | Date; // Fecha y hora de la última recarga automática de tokens
    created_at?: string | Date;         // Marca de tiempo con la fecha de registro en la plataforma
    force_password_change?: boolean;    // Bandera que obliga al usuario a actualizar su contraseña
    password_reset_requested?: boolean; // Indica si existe una solicitud de recuperación de contraseña activa
}

/*
 * Define la estructura estándar de las respuestas HTTP emitidas por los
 * endpoints de autenticación desde el backend
 */
export interface AuthResponse {
    status: string;                     // Estado final de la transacción HTTP
    message: string;                    // Mensaje descriptivo sobre el resultado de la operación
    data: {                             // Payload de la respuesta
        token: string;                  // Token JWT emitido por el servidor
        user: User;                     // Identidad del usuario autenticado
    };
}

/*
 * Modela los metadatos de un archivo físico almacenado en el servidor.
 * Se utiliza tanto para representar los ficheros personales de los estudiantes
 * como los recursos globales inyectados por los administradores
 */
export interface FileItem {
    id: number;                         // Identificador único del archivo
    user_id?: number;                   // Referencia al usuario propietario del archivo
    filename: string;                   // Nombre interno con el que se almacena en el disco
    original_name: string;              // Nombre original del archivo subido por el usuario
    filepath: string;                   // Ruta de almacenamiento dentro del servidor
    size_bytes: number;                 // Peso del archivo medido en bytes
    is_global: boolean;                 // Indica si es recurso compartido (true) o privado (false)
    created_at: string;                 // Marca de tiempo del momento de subida
}

/*
 * Define el formato de la respuesta HTTP proporcionada por el backend al 
 * realizar consultas sobre el directorio de almacenamiento
 */
export interface FileResponse {
    status: string;                     // Resultado de la petición de obtención de archivos
    message?: string;                   // Mensaje adicional informativo desde el servidor
    data: FileItem[];                   // Array de archivos correspondientes a la consulta realizada
}