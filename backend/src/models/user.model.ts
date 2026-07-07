/*******************************************************************************
 * ARCHIVO: user.model.ts                                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Modelo de datos central para la gestión de identidades y credenciales.      *
 * Define la estructura de los usuarios en la base de datos y el contenido     *
 * del payload que viajará encriptado dentro de los tokens de sesión (JWT).    *
 *******************************************************************************/

/*
 * Entidad principal de usuario del sistema
 * Mapea exactamente las columnas y estados de la tabla 'users' en MySQL
 */
export interface User {
    id?: number;                        // Identificador único autoincremental asignado por MySQL
    name: string;                       // Nombre completo del alumno o administrador
    email: string;                      // Correo electrónico único usado como credencial principal de acceso
    password_hash: string;              // Contraseña encriptada unidireccionalmente con el algoritmo bcrypt
    role: 'normal' | 'admin';           // Sistema de control de acceso basado en roles
    is_active: boolean;                 // Bandera de seguridad que permite suspender cuentas temporalmente
    tokens: number;                     // Saldo actual disponible para la ejecución de código en la GPU
    last_token_renewal?: Date;          // Fecha de la última renovación automática de tokens
    created_at?: Date;                  // Fecha de creación del usuario

    reset_token?: string | null;        // PIN temporal de 6 dígitos para validación de identidad por correo
    reset_token_expiry?: Date | null;   // Fecha de expiración del PIN de recuperación
    password_reset_requested: boolean;  // Indica si el usuario solicitó ayuda manual al administrador
    force_password_change: boolean;     // Obliga al usuario a cambiar la contraseña tras un reseteo del admin
}

/*
 * Estructura del payload almacenado dentro del JWT
 * Define la información del usuario que viaja inyectada en cada petición HTTP
 */
export interface JwtPayload {
    userId: number;                     // ID único del usuario autenticado
    name: string;                       // Nombre del usuario autenticado
    email: string;                      // Correo electrónico asociado al usuario
    role: 'normal' | 'admin';           // Rol de autorización del usuario
    force_password_change: boolean;     // Indica si debe forzarse el cambio de contraseña
}