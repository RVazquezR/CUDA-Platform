/*******************************************************************************
 * ARCHIVO: register.component.ts                                              *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente encargado del registro de nuevos usuarios dentro de la           *
 * plataforma. Gestiona la validación de datos, la comprobación del estado     *
 * global de registros y la creación segura de nuevas cuentas mediante el      *
 * servicio de autenticación.                                                  *
 *******************************************************************************/

import { Component, inject, signal, OnInit } from '@angular/core';                        // Decoradores, señales reactivas e interfaces del ciclo de vida
import { CommonModule } from '@angular/common';                                           // Directivas estructurales básicas de Angular
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'; // Herramientas de construcción y validación de formularios
import { Router, RouterModule } from '@angular/router';                                   // Servicios de navegación y directivas de rutas
import { AuthService } from '../../../core/services/auth.service';                        // Servicio encargado de la autenticación

/*
 * Declaración del componente autónomo (Standalone) encargado
 * de la creación de nuevas cuentas de usuario
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-register',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias utilizadas dentro de la plantilla
  imports: [CommonModule, ReactiveFormsModule, RouterModule],

  // Ruta de la plantilla HTML asociada
  templateUrl: './register.component.html'
})

export class RegisterComponent implements OnInit {

  // Ruta de la plantilla HTML asociada
  private fb = inject(FormBuilder);

  // Servicio encargado de la autenticación
  private authService = inject(AuthService);

  // Servicio utilizado para la navegación entre vistas
  private router = inject(Router);

  /*****************************************************************************
   * ESTADOS REACTIVOS
   *****************************************************************************/

  // Indica si existe una operación de registro en curso
  isLoading = signal<boolean>(false);

  // Mensajes de error mostrados al usuario
  errorMessage = signal<string | null>(null);

  // Mensajes de éxito
  successMessage = signal<string | null>(null);

  // Controla la visibilidad del campo de contraseña
  showPassword = signal<boolean>(false);

  // Controla la visibilidad del campo de confirmación de contraseña
  showConfirmPassword = signal<boolean>(false);

  // Indica si el sistema permite actualmente nuevos registros
  isRegistrationEnabled = signal<boolean>(true); 



  // Expresión regular utilizada para validar contraseñas robustas
  passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+[\]{};':"\\|,.<>/?-]).{8,}$/;



  /*
   * Formulario reactivo para la creación de nuevas cuentas
   */
  registerForm: FormGroup = this.fb.group({

    // Nombre del usuario
    name: ['', [Validators.required, Validators.minLength(3)]],

    // Dirección de correo electrónico
    email: ['', [Validators.required, Validators.email]],

    // Contraseña validada
    password: ['', [Validators.required, Validators.pattern(this.passwordRegex)]],

    // Campo de confirmación de contraseña
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });


  /*
   * Verifica que la contraseña principal y su confirmación coincidan
   */
  passwordMatchValidator(group: FormGroup) {

    // Recupera la contraseña principal
    const pass = group.get('password')?.value;

    // Recupera la contraseña de confirmación
    const confirm = group.get('confirmPassword')?.value;

    // Devuelve el resultado de la validación
    return pass === confirm ? null : { mismatch: true };
  }

  /*
   * Punto de entrada del ciclo de vida del componente
   * Recupera el estado global de apertura o cierre de registros
   */
  ngOnInit() {

    // Solicita al backend el estado actual de los registros
    this.authService.checkRegistrationStatus().subscribe({

      // Actualiza el estado del registro
      next: (res) => this.isRegistrationEnabled.set(res.data.registration_enabled),

      // Bloquea el registro por seguridad ante errores
      error: () => this.isRegistrationEnabled.set(false)
    });
  }

  /*
   * Procesa la creación de una nueva cuenta validando la disponibilidad del 
   * registro y los datos introducidos
   */
  onSubmit() {

    // Elimina errores anteriores
    this.errorMessage.set(null);

    // Elimina mensajes anteriores
    this.successMessage.set(null);

    // Verifica que el sistema permitela creación de cuentas
    if (!this.isRegistrationEnabled()) {

      // Informa del bloqueo de registros
      this.errorMessage.set('Los registros están cerrados actualmente.');
      return;
    }

    // Comprueba que el formulario supera las validaciones
    if (this.registerForm.invalid) {

      // Marca todos los campos para mostrar validaciones
      this.registerForm.markAllAsTouched();
      return;
    }

    // Activa el estado visual de procesamiento
    this.isLoading.set(true);

    // Recupera los datos introducidos por el usuario
    const { name, email, password } = this.registerForm.value;

    // Solicita al backend la creación de la nueva cuenta
    this.authService.register(name, email, password).subscribe({

      next: (res) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);

        // Mensaje de éxito
        this.successMessage.set('¡Cuenta creada con éxito! Redirigiendo al login...');
        
        // Redirige automáticamente a la pantalla de login
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (err) => {

        // Finaliza el estado de carga
        this.isLoading.set(false);

        // Muestra el mensaje recibido desde el servidor
        this.errorMessage.set(err.error?.message || 'Error al registrar el usuario.');
      }
    });
  }
}