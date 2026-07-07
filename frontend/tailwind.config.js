/*******************************************************************************
 * ARCHIVO: tailwind.config.js                                                 *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Archivo de configuración principal de Tailwind CSS. Define las rutas que    *
 * serán analizadas durante el proceso de compilación y personaliza el tema    *
 * visual de la aplicación mediante colores corporativos, estilos semánticos   *
 * y extensiones específicas.                                                  *
 ******************************************************************************/

/*
 * Esta anotación permite que Visual Studio Code proporcione autocompletado, 
 * validación y ayuda contextual sobre las propiedades disponibles en el objeto 
 * de configuración.
 *
 * No afecta al funcionamiento de la aplicación en tiempo de ejecución.
 */

/** @type {import('tailwindcss').Config} */

// Exportación de la configuración principal de Tailwind CSS
module.exports = {

  /*
   * Define el alcance del analizador estático para la optimización de código.
   * El compilador escanea estos directorios buscando clases utilitarias en
   * uso, eliminando el resto para minimizar el peso del CSS en producción
   */
  content: [

    // Analizar todos los archivos HTML y TypeScript del proyecto
    "./src/**/*.{html,ts}",
  ],

  // Personalización del tema visual global
  theme: {

    // Permite extender el tema por defecto de Tailwind sin sobrescribirlo
    extend: {

      // Paleta de colores corporativa utilizada
      colors: {

        /***********************************************************************
         * COLORES DE SUPERFICIE
         **********************************************************************/
        // Negro asfalto para fondo principal de la aplicación
        background: '#09090b',

        // Gris oscuro para fondo secundario utilizado en tarjetas y paneles
        surface: '#18181b',

        // Para bordes sutiles
        surfaceBorder: '#27272a', 

        /***********************************************************************
         * COLORES CUDA / NVIDIA
         **********************************************************************/
        cuda: {

          // Verde corporativo principal de NVIDIA CUDA
          DEFAULT: '#76B900',

          // Variante más brillante para los hover
          hover: '#8ED300', 

          // Color utilizado para sombras y brillos
          glow: 'rgba(118, 185, 0, 0.2)'
        },
        
        /***********************************************************************
         * COLORES SEMÁNTICOS (PARA TOAST Y MENSAJES)
         **********************************************************************/
        // Rojo utilizado para errores y eliminaciones
        danger: '#ef4444',

        // Naranja utilizado para advertencias
        warning: '#f59e0b',
      }
    },
  },

  // Plugins adicionales de Tailwind 
  plugins: [],
}