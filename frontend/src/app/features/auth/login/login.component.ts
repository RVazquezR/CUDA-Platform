/*******************************************************************************
 * ARCHIVO: login.component.ts                                                 *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente encargado de la autenticación.                                   *
 * Gestiona el inicio de sesión, la solicitud de ayuda al administrador, la    *
 * recuperación mediante correo electrónico y PIN temporal.                    *
 *******************************************************************************/

import { Component, inject, signal } from '@angular/core';                                // Decoradores, señales reactivas e inyección de dependencias
import { CommonModule } from '@angular/common';                                           // Directivas estructurales básicas de Angular
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'; // Herramientas para validación de formularios reactivos
import { Router, RouterModule } from '@angular/router';                                   // Servicios de enrutamiento y navegación
import { AuthService } from '../../../core/services/auth.service';                        // Servicio encargado de la autenticación

// Tipado estricto para definir las posibles vistas virtuales que puede
// renderizar el componente sin cambiar de ruta (Single Page Application)
type LoginView = 'login' | 'forgot-options' | 'forgot-email' | 'forgot-admin' | 'reset-pin';

/*
 * Declaración del componente autónomo (Standalone) encargado
 * de la autenticación y recuperación de credenciales
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-login',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias utilizadas por la plantilla HTML
  imports: [CommonModule, ReactiveFormsModule, RouterModule],

  // Ruta de la plantilla HTML asociada
  templateUrl: './login.component.html',

  // Hoja de estilos específica del componente
  styleUrls: ['./login.component.scss']
})

export class LoginComponent {

  // Constructor reactivo de formularios
  private fb = inject(FormBuilder);

  // Servicio encargado de la autenticación
  private authService = inject(AuthService);

  // Servicio utilizado para la navegación entre vistas
  private router = inject(Router);

  /*****************************************************************************
   * ESTADOS REACTIVOS
   *****************************************************************************/

  // Vista actualmente mostrada dentro del flujo de autenticación
  currentView = signal<LoginView>('login');

  // Indica si existe una operación en curso
  isLoading = signal<boolean>(false);

   // Almacena mensajes de error mostrados al usuario
  errorMessage = signal<string | null>(null);

  // Almacena mensajes de éxito
  successMessage = signal<string | null>(null); 

  // Controla la visibilidad de la contraseña de acceso
  showPassword = signal<boolean>(false);

  // Controla la visibilidad de la nueva contraseña durante el reseteo
  showNewPassword = signal<boolean>(false);

  // Almacena temporalmente el correo de recuperación
  targetEmail = signal<string>('');



  // Expresión regular utilizada para validar contraseñas robustas
  passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+[\]{};':"\\|,.<>/?-]).{8,}$/;



  /*
   * Formulario para el inicio de sesión
   */
  loginForm: FormGroup = this.fb.group({

    // Dirección de correo electrónico del usuario
    email: ['', [Validators.required, Validators.email]],

    // Contraseña de acceso
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  /*
   * Formulario para solicitar recuperación mediante correo
   */
  emailForm: FormGroup = this.fb.group({
    // Correo electrónico para enviar el PIN tempoal
    email: ['', [Validators.required, Validators.email]]
  });

  /*
   * Formulario para validar el PIN y establecer una nueva contraseña
   */
  resetForm: FormGroup = this.fb.group({

    // Código temporal recibido por el usuario
    pin: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],

    // Nueva contraseña validada
    newPassword: ['', [Validators.required, Validators.pattern(this.passwordRegex)]]
  });



  /*
   * Orquesta el cambio de la vista activa dentro del flujo de autenticación
   * y limpia los mensajes temporales mostrados al usuario
   */
  setView(view: LoginView) {

    // Actualiza la vista actual
    this.currentView.set(view);

    // Elimina errores previos
    this.errorMessage.set(null);

    // Elimina mensajes de éxito previos
    this.successMessage.set(null);

    // Reinicia el formulario de correo si es la vista
    if (view === 'forgot-email' || view === 'forgot-admin') {
      this.emailForm.reset();
    }
  }

  /*
   * Procesa la autenticación del usuario mediante correo
   * electrónico y contraseña en el login.
   */
  onSubmit() {

    // Elimina errores previos
    this.errorMessage.set(null);

    // Verifica la validez del formulario
    if (this.loginForm.invalid) {

      // Marca todos los campos para mostrar validaciones
      this.loginForm.markAllAsTouched();

      // Informa del error detectado
      this.errorMessage.set('Por favor, revisa que el email o contraseña sea válido.');

      // Información de depuración
      console.warn('Bloqueo local: Formulario inválido', this.loginForm.value);
      return;
    }

    // Activa el estado visual de carga
    this.isLoading.set(true);

    // Recupera las credenciales introducidas
    const { email, password } = this.loginForm.value;

    // Solicita la autenticación al backend
    this.authService.login(email, password).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);
        
         // Recupera los datos del usuario autenticado
        const user = res.data.user;

        // Verifica si el usuario debe cambiar la contraseña
        if (user.force_password_change) {

          console.log(`Login detectado con contraseña temporal. Forzando cambio de contraseña...`);

          // Redirige al formulario de cambio obligatorio
          this.router.navigate(['/auth/force-change']);
          return;
        }

        // Recupera el rol asignado al usuario
        const userRole = this.authService.currentUser()?.role;
        
        console.log(`Login exitoso. Rol: ${userRole}`);
        
        // Redirige según el perfil autenticado
        if (userRole === 'admin') {
          this.router.navigate(['/admin/dashboard']);
        } else {
          this.router.navigate(['/workspace']);
        }
      },
      error: (err) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);

        // Registra el error recibido
        console.error('Error devuelto por el servidor:', err);

        // Recupera el mensaje recibido
        const message = err.error?.message || 'Error de conexión. ¿Está el backend conectado?';

        // Actualiza el mensaje mostrado al usuario
        this.errorMessage.set(message);
      }
    });
  }

  /*
   * Solicita ayuda al administrador para la recuperación de acceso mediante 
   * contraseña temporal.
   */
  submitAdminHelp() {

    // Verifica la validez del formulario
    if (this.emailForm.invalid) { this.emailForm.markAllAsTouched(); return; }
    
    // Activa el estado visual de carga
    this.isLoading.set(true);

    // Elimina errores previos
    this.errorMessage.set(null);

    // Recupera el correo introducido
    const email = this.emailForm.value.email;

    // Envía la solicitud al backend
    this.authService.requestAdminHelp(email).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);

        // Informa de la creación de la solicitud
        this.successMessage.set('Alerta enviada. El administrador te proporcionará una contraseña temporal.');

        // Regresa automáticamente a la pantalla principal de login
        setTimeout(() => this.setView('login'), 6000);
      },

      // Finaliza el estado de carga ante errores de red
      error: () => this.isLoading.set(false)
    });
  }

  /*
   * Solicita el envío de un PIN temporal al correo electrónico asociado 
   * a la cuenta para la recuperación de la contraseña
   */
  submitEmailPin() {

    // Verifica la validez del formulario
    if (this.emailForm.invalid) { this.emailForm.markAllAsTouched(); return; }
    
    // Activa el estado visual de carga
    this.isLoading.set(true);

    // Elimina errores previos
    this.errorMessage.set(null);

    // Recupera el correo introducido
    const email = this.emailForm.value.email;

    // Almacena el correo para el siguiente paso
    this.targetEmail.set(email);

    // Solicita al backend el envío del PIN temporal
    this.authService.requestEmailToken(email).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);

        // Avanza al formulario de introducción del PIN
        this.setView('reset-pin');
      },

      error: () => this.isLoading.set(false)

    });
  }

  /*
   * Valida el PIN recibido y actualiza la contraseña de la cuenta
   */
  submitReset() {

    // Verifica la validez del formulario
    if (this.resetForm.invalid) { this.resetForm.markAllAsTouched(); return; }
    
    // Activa el estado visual de carga
    this.isLoading.set(true);

    // Elimina errores previos
    this.errorMessage.set(null);

    // Recupera los datos introducidos
    const { pin, newPassword } = this.resetForm.value;

    // Solicita validación y cambio de contraseña al backend
    this.authService.resetPasswordWithToken(this.targetEmail(), pin, newPassword).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);

        // Mensaje de éxito
        this.successMessage.set('¡Contraseña cambiada con éxito! Ya puedes iniciar sesión.');

        // Regresa al login
        this.setView('login');

        // Limpia los datos introducidos anteriormente
        this.loginForm.reset();
      },
      error: (err) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);

        // Muestra el mensaje de error recibido
        this.errorMessage.set(err.error?.message || 'Error al cambiar la contraseña');
      }
    });
  }
}