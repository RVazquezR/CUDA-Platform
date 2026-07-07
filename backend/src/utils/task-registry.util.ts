/*******************************************************************************
 * ARCHIVO: task-registry.util.ts                                              *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Registro global en memoria de ejecuciones activas.                          *
 * Permite asociar cada identificador de una tarea en la base de datoscon su   *
 * controlador de aborto, AbortController, para poder cancelar procesos en     *
 * ejecución desde cualquier parte del sistema.                                *
 *******************************************************************************/

/*
 * Estructura de datos en memoria
 * Actúa como puente de comunicación entre el controlador (recibe la orden de 
 * cancelar) y el Worker (que tiene el hilo bloqueado procesando en la GPU)
 * - Llave (number): El ID de la tarea asignado por la base de datos
 * - Valor (AbortController): Instancia nativa de Node.js que emite la señal 
 *                          fatal al proceso hijo
 */
export const activeExecutions = new Map<number, AbortController>();