# CUDA Platform
**Diseño y desarrollo de una plataforma web académica para la ejecución de programas CUDA**

## Descripción del proyecto
Este proyecto presenta el desarrollo de una plataforma web distribuida diseñada para solventar las limitaciones de acceso a hardware especializado en el ámbito académico. El sistema permite a los estudiantes de la asignatura Paradigmas Avanzados de Programación de la Universidad de Alcalá compilar y ejecutar código CUDA de forma remota, segura y asíncrona sobre una GPU dedicada. Esta solución elimina la dependencia de configuraciones locales complejas y soluciona la ineficiencia, saturación de memoria y cuellos de botella generados por el uso de Escritorio Remoto (RDP).

La plataforma implementa una arquitectura de monolito modular basado en servicios de alto rendimiento que abstrae la complejidad del hardware, proporcionando un entorno de desarrollo profesional, accesible directamente desde cualquier navegador web y totalmente tolerante a fallos.

## Características principales
* **Arquitectura desacoplada:** Separación total entre la capa de presentación (Frontend), desarrollada como una *Single Page Application* (SPA) interactiva con Angular, y la lógica de negocio (Backend), sustentada por una API RESTful programada en Node.js y TypeScript.
* **Orquestación asíncrona:** Gestión inteligente de múltiples cargas de trabajo y control de concurrencia dinámico mediante una cola de procesamiento basada en BullMQ y respaldada por Redis en memoria RAM. Esto evita bloqueos del hilo principal del servidor y optimiza el uso de los núcleos de la GPU.
* **Entornos aislados (*Sandbox*):** Ejecución segura del código mediante la creación dinámica de directorios temporales efímeros para cada ejecución. La inyección de recursos (archivos personales y recursos globales) se realiza mediante enlaces duros (*hardlinks*), garantizando el aislamiento físico y logrando un rendimiento de entrada/salida casi instantáneo sin duplicar los bloques de datos.
* **Telemetría en tiempo real:** Establecimiento de canales bidireccionales de baja latencia mediante WebSockets (Socket.IO) para capturar y emitir instantáneamente los flujos de salida estándar (*stdout*) y de errores (*stderr*) del compilador `nvcc` directamente a la consola virtual del estudiante.
* **Gobernanza dinámica (Panel de Control):** Interfaz exclusiva para el profesorado que permite la reconfiguración en caliente (*hot-reloading*) sin necesidad de reiniciar el servidor. Permite modificar parámetros críticos como la concurrencia del Worker, el tiempo máximo de ejecución para prevenir bucles infinitos, la capacidad de almacenamiento y la programación automática de renovación de *tokens*. Además, permite intervenir directamente sobre la cola de procesamiento (pausar, reanudar o vaciar) y administrar integralmente las cuentas de usuario.
* **Seguridad y Auditoría:** Protección de rutas mediante control de acceso basado en roles y autenticación con JSON Web Tokens (JWT). Cuenta con cifrado unidireccional de credenciales mediante `bcrypt`, limitación de tasa (*Rate Limiting*) para evitar ataques DoS, y un sistema automatizado de recuperación de contraseñas integrado con la API de Resend. La base de datos conserva una copia inmutable del código fuente enviado en cada ejecución para evaluación docente y auditorías de seguridad.

## Tecnologías utilizadas
* **Frontend:** Angular (Standalone Components), Tailwind CSS, TypeScript, RxJS.
* **Backend:** Node.js, Express, TypeScript, Socket.IO, BullMQ.
* **Persistencia y Colas:** MySQL / MariaDB (motor transaccional InnoDB), Redis.
* **Infraestructura y Hardware:** Entorno Windows con ecosistema XAMPP (Apache + MariaDB), Docker (para el contenedor de Redis) y el compilador oficial NVIDIA CUDA Toolkit (`nvcc`) operando sobre una tarjeta gráfica dedicada NVIDIA.
* **Servicios Externos:** Resend (Pasarela API para el envío automatizado de correos electrónicos).

## Requisitos de instalación
* **Sistema Operativo:** Windows 10/11 o Windows Server (arquitectura x64).
* **Entorno Web:** Ecosistema XAMPP con el servidor Apache configurado en los puertos 80/443 y el gestor de bases de datos MySQL/MariaDB en el puerto 3306 (el script de despliegue de la base de datos está disponible dentro de la carpeta del backend).
* **Hardware:** Tarjeta gráfica dedicada NVIDIA compatible con la arquitectura de procesamiento CUDA.
* **Software Base:** Node.js (versión LTS >= 20.x), NVIDIA CUDA Toolkit correctamente configurado en las variables de entorno del sistema (`PATH`), compilador C++ de respaldo (Microsoft Visual Studio Build Tools), y servidor de datos en memoria Redis ejecutado a través de Docker.


---

> **Nota de seguridad:** Por estrictos motivos de seguridad y cumplimiento normativo, ciertos archivos de configuración sensibles (como los archivos `.env` que albergan las claves criptográficas y los secretos de las APIs) y las dependencias de librerías (`node_modules`) han sido excluidos intencionadamente de este repositorio público.

## Autoría y Licencia
Este proyecto ha sido diseñado y desarrollado íntegramente por **Raúl Vázquez Rodríguez** como Trabajo de Fin de Grado en el Grado de Ingeniería Informática de la Escuela Politécnica Superior de la Universidad de Alcalá, bajo la tutorización académica de **Sergio Caro Álvaro**, durante el curso 2025-2026.

## Contacto
Si tiene alguna duda sobre la instalación, la configuración del entorno o el funcionamiento de la plataforma, puede contactar conmigo a través de:
* **Email:** [rvazquezr05@gmail.com](mailto:[rvazquezr05@gmail.com)
* **LinkedIn:** [Raúl Vázquez Rodríguez](https://www.linkedin.com/in/ra%C3%BAl-v%C3%A1zquez-rodr%C3%ADguez-57bbb6387/)
* **Incidencias:** Si encuentra algún problema técnico, siéntase libre de abrir un *Issue* en este repositorio.