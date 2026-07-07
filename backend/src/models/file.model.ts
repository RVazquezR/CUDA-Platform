/*******************************************************************************
 * ARCHIVO: file.model.ts                                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Modelo de datos para el sistema de almacenamiento de archivos.              *
 * Define el contrato estricto (interfaz) que mapea la estructura de la tabla  *
 * 'files' en la base de datos, garantizando tipado seguro en TypeScript.      *
 *******************************************************************************/

/*
 * Interfaz representativa de un archivo en el ecosistema
 * Se utiliza tanto para archivos personales de alumnos como para recursos globales
 */
export interface FileRecord {
    id?: number;                // Identificador único autoincremental asignado por MySQL
    user_id: number | null;     // Propietario del archivo (null si el archivo es global)
    original_name: string;      // Nombre real con el que el usuario subió el documento
    stored_name: string;        // Nombre interno único (UUID) con el que se guarda físicamente en el disco
    size_bytes: number;         // Tamaño total del archivo en bytes
    is_global: boolean;         // Indica si el archivo es global o privado
    created_at?: Date;          // Fecha de creación del registro
}