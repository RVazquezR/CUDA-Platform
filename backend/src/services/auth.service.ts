/*******************************************************************************
 * ARCHIVO: auth.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Servicio para la gestión de identidades y credenciales.                     *
 * Encapsula la lógica de negocio para registro, inicio de sesión, generación  *
 * de tokens JWT y los distintos flujos de recuperación de contraseñas.        *
 *******************************************************************************/

import bcrypt from 'bcrypt';                                        // Librería para hashear y verificar contraseñas de forma segura
import jwt from 'jsonwebtoken';                                     // Librería para generar y validar tokens JWT
import pool from '../config/db.config.js';                          // Pool de conexiones reutilizable hacia la base de datos
import type { RowDataPacket, ResultSetHeader } from 'mysql2';       // Tipos de mysql2 para tipar resultados y filas de consultas SQL
import type { User, JwtPayload } from '../models/user.model.js';    // Interfaces y tipos relacionados con usuarios y payload JWT

// Coste computacional del algoritmo de encriptación (Balance entre seguridad y rendimiento)
const SALT_ROUNDS = 10;

export const authService = {
    
    /*
     * Registra un nuevo usuario en el sistema
     * Encripta la contraseña de forma unidireccional antes de guardarla en la 
     * base de datos
     */
    async registerUser(name: string, email: string, passwordPlain: string, role: 'normal' | 'admin' = 'normal'): Promise<number> {
        // Comprueba si el correo ya existe para evitar duplicados
        const [existingUsers] = await pool.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        // Bloquea el proceso lanzando un error si se encuentra coincidencia
        if (existingUsers.length > 0) {
            throw new Error('El correo ya está registrado');
        }

        // Hashea contraseña con algoritmo bcrypt y no guardarla en texto plano
        const passwordHash = await bcrypt.hash(passwordPlain, SALT_ROUNDS);

        // Inserta el nuevo registro en base de datos, activo por defecto (is_active = 1)
        const [result] = await pool.query<ResultSetHeader>(
            'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
            [name, email, passwordHash, role, 1]
        );

        // Devuelve el identificador único autogenerado por MySQL
        return result.insertId;
    },

    /*
     * Autentica a un usuario y genera su JWT
     * Verifica credenciales, estado de la cuenta y construye el payload del JWT
     */
    async loginUser(email: string, passwordPlain: string): Promise<{ token: string, user: Partial<User> }> {
        // Recupera al usuario de la base de datos si existe
        const [users] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        // Si el array está vacío el usuario no existe en el sistema
        if (users.length === 0) {
            throw new Error('Credenciales inválidas');
        }

        // Castea el primer resultado a la interfaz estricta User
        const user = users[0] as User;
        
        // Comprueba si el administrador ha suspendido esta cuenta
        user.is_active = Boolean(user.is_active);
        if (!user.is_active) {
            throw new Error('Tu cuenta ha sido suspendida. Contacta con el administrador.');
        }

        // Compara la contraseña ingresada con el hash de la base de datos
        const isPasswordValid = await bcrypt.compare(passwordPlain, user.password_hash);
        if (!isPasswordValid) {
            throw new Error('Credenciales inválidas');
        }

        // Construye el payload que viajará encriptado dentro del JWT
        const payload: JwtPayload = {
            userId: user.id!,
            name: user.name,
            email: user.email,
            role: user.role,
            force_password_change: Boolean(user.force_password_change) // 🚀 Inyectado
        };

        // Extrae la clave maestra del servidor desde las variables de entorno
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET no está configurado en el servidor');
        }

        // Valor por defecto de 8 horas convertidas a segundos
        let expirationSeconds = 8 * 3600; 

        try {
            // Consultar en base de datos configuración de duración de JWT
            const [settings] = await pool.query<RowDataPacket[]>(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'token_expiration_hours'"
            );
            if (settings.length > 0) {
                const hours = parseInt(settings[0].setting_value, 10);

                // Horas por 3600 para sacar los segundos
                expirationSeconds = hours * 3600; 
            }
        } catch (e) {
            console.error("Error leyendo duración del token, usando 8h por defecto");
        }

        // Genera token con validez dinámica basada en configuración del sistema
        const token = jwt.sign(payload, secret, { expiresIn: expirationSeconds });

        // Devuelve el JWT junto a los datos públicos del usuario autenticado
        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                tokens: user.tokens,
                // Convierte valor a un booleano real (true o false)
                force_password_change: Boolean(user.force_password_change)
            }
        };
    },

    /*
     * Activa la bandera de alerta para que el administrador intervenga
     * Usado cuando el usuario pide ayuda al admin si la recuperación por correo
     * no funciona
     */
    async requestAdminPasswordReset(email: string): Promise<void> {
        // Simplemente actualiza el flag booleano si el email existe
        const [result] = await pool.query<ResultSetHeader>(
            'UPDATE users SET password_reset_requested = 1 WHERE email = ?',
            [email]
        );

        // Verifica que el usuario exista en la base de datos
        if (result.affectedRows === 0) throw new Error('Usuario no encontrado');
    },

    /*
     * Genera un PIN de 6 dígitos para recuperación de contraseña por correo
     * Establece una caducidad de 15 minutos para limitar su validez
    */
    async generateEmailResetToken(email: string): Promise<string> {
        // Genera un PIN aleatorio de 6 dígitos
        const pin = Math.floor(100000 + Math.random() * 900000).toString();

        // Calcula la fecha de expiración sumando 15 minutos
        const expiryDate = new Date(Date.now() + 15 * 60 * 1000); 

        // Guarda el PIN y la fecha de expiración en la base de datos
        const [result] = await pool.query<ResultSetHeader>(
            'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
            [pin, expiryDate, email]
        );

        // Verifica que el usuario exista antes de continuar
        if (result.affectedRows === 0) throw new Error('Usuario no encontrado');
        
        // Devuelve el PIN para enviarlo mediante correo electrónico
        return pin;
    },

    /*
     * Valida el PIN recibido y establece una nueva contraseña segura
     * Limpia los datos de recuperación para evitar reutilizaciones
    */
    async resetPasswordWithToken(email: string, token: string, newPasswordPlain: string): Promise<void> {
        // Busca coincidencias entre email y PIN de recuperación
        const [users] = await pool.query<RowDataPacket[]>(
            'SELECT id, reset_token_expiry FROM users WHERE email = ? AND reset_token = ?',
            [email, token]
        );

        // Verifica si el PIN es válido
        if (users.length === 0) throw new Error('El PIN es incorrecto.');
        
        // Comprueba si el PIN ha expirado
        const expiry = new Date(users[0].reset_token_expiry);
        if (expiry < new Date()) throw new Error('El PIN ha caducado. Solicita uno nuevo.');

        // Genera el hash seguro de la nueva contraseña
        const passwordHash = await bcrypt.hash(newPasswordPlain, SALT_ROUNDS);

        // Actualiza la contraseña y limpia los datos de recuperación
        await pool.query(
            `UPDATE users SET 
                password_hash = ?, reset_token = NULL, reset_token_expiry = NULL, 
                password_reset_requested = 0, force_password_change = 0 
             WHERE id = ?`,
            [passwordHash, users[0].id]
        );
    },

    /*
     * Permite cambiar la contraseña temporal asignada por el administrador
     * Desactiva el estado de cambio forzado tras actualizarla
    */
    async updateForcedPassword(userId: number, newPasswordPlain: string): Promise<void> {
        // Genera el hash seguro de la nueva contraseña
        const passwordHash = await bcrypt.hash(newPasswordPlain, SALT_ROUNDS);
        
        // Actualiza la contraseña y elimina el estado de cambio forzado
        await pool.query(
            'UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?',
            [passwordHash, userId]
        );
    }
};