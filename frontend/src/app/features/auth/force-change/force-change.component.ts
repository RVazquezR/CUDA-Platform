/*******************************************************************************
 * ARCHIVO: force-change.component.ts                                          *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente para el flujo de actualización forzosa de contraseña.            *
 * Intercepta a los usuarios que han accedido con una contraseña temporal y    *
 * les exige establecer una clave definitiva y segura                          *
 *******************************************************************************/

import { Component, inject, signal } from '@angular/core';                                // Decoradores, señales reactivas e inyección de dependencias
import { CommonModule } from '@angular/common';                                           // Directivas estructurales básicas de Angular
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'; // Herramientas para la construcción de formularios reactivos
import { Router } from '@angular/router';                                                 // Servicio de navegación entre rutas
import { AuthService } from '../../../core/services/auth.service';                        // Servicio encargado de la autenticación

/*
 * Declaración del componente autónomo (Standalone) encargado
 * de gestionar el cambio obligatorio de contraseña.
 */
@Component({

  // Selector utilizado por Angular para instanciar el componente
  selector: 'app-force-change',

  // Define el componente como Standalone
  standalone: true,

  // Dependencias utilizadas dentro de la plantilla
  imports: [CommonModule, ReactiveFormsModule],

   // Ruta de la plantilla HTML asociada
  templateUrl: './force-change.component.html',

  // Hoja de estilos específica del componente
  styleUrls: ['./force-change.component.scss']
})


export class ForceChangeComponent {

  // Constructor reactivo de formularios
  private fb = inject(FormBuilder);

  // Servicio encargado de la autenticación
  private authService = inject(AuthService);

  // Servicio utilizado para la navegación entre vistas
  private router = inject(Router);

  /*****************************************************************************
   * ESTADOS REACTIVOS
   *****************************************************************************/

  // Indica si la solicitud de cambio está siendo procesada
  isLoading = signal<boolean>(false);

  // Almacena mensajes de error mostrados al usuario
  error = signal<string | null>(null);

  // Controla la visibilidad de la contraseña principal
  showPassword = signal<boolean>(false);

  // Controla la visibilidad de la confirmación de contraseña
  showConfirmPassword = signal<boolean>(false);



  // Expresión regular utilizada para validar la complejidad mínima exigida
  passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+[\]{};':"\\|,.<>/?-]).{8,}$/;

  /*
   * Formulario reactivo utilizado para capturar la nueva contraseña
   */
  changeForm: FormGroup = this.fb.group({

    // Campo de contraseña con validaciones de formato y obligatoriedad
    password: ['', [Validators.required, Validators.pattern(this.passwordRegex)]],

    // Campo de confirmación obligatorio
    confirmPassword: ['', [Validators.required]]
  });

  /*
   * Procesa la solicitud de cambio de contraseña y ejecuta la actualización 
   * segura en el backend
   */
  onSubmit(): void {

    // Elimina errores anteriores
    this.error.set(null);
    
    // Recupera los valores introducidos por el usuario
    const { password, confirmPassword } = this.changeForm.value;

    // Verifica que ambas contraseñas coinciden
    if (password !== confirmPassword) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }

    // Verifica que cumple las validaciones
    if (this.changeForm.invalid) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    // Activa el estado visual de procesamiento
    this.isLoading.set(true);

    // Solicita al backend la actualización de la contraseña
    this.authService.changeForcedPassword(password).subscribe({

      next: () => {

        // Finaliza el estado de carga
        this.isLoading.set(false);
        
        
        // Destruye la sesión actual tras actualizar la contraseña, obligando
        // a generar un nuevo JWT con los permisos y estados actualizados
        this.authService.logout();

        // Mensaje de éxito
        alert('Contraseña actualizada con éxito. Por favor, inicia sesión con tu nueva contraseña definitiva.');

        // Redirige al formulario de autenticación
        this.router.navigate(['/login']);
      },
      error: (err) => {

         // Finaliza el estado de carga
        this.isLoading.set(false);

        // Muestra el mensaje de error
        this.error.set(err.error?.message || 'Error al intentar actualizar la contraseña. Reintenta en unos momentos.');
      }
    });
  }
}