/*******************************************************************************
 * ARCHIVO: auth.service.ts                                                    *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Servicio responsable de la autenticación y gestión de sesiones del usuario. *
 * Centraliza las operaciones de registro, inicio de sesión, recuperación de   *
 * credenciales y persistencia del estado de autenticación mediante JSON Web   *
 * Tokens (JWT), proporcionando un mecanismo reactivo para compartir           *
 * la identidad del usuario entre todos los componentes de la aplicación.      *
 *******************************************************************************/

import { Injectable, signal } from '@angular/core';               // Decoradores inyección de dependencias proporcionados por Angular
import { HttpClient } from '@angular/common/http';                // Cliente HTTP utilizado para comunicarse con la API REST
import { environment } from '../../../environments/environment';  // Variables de configuración dependientes del entorno
import { AuthResponse, User } from '../models/user.model';        // Tipados estrictos para las entidades de identidad
import { tap } from 'rxjs/operators';                             // Operador reactivo para ejecutar efectos secundarios
import { jwtDecode } from 'jwt-decode';                           // Librería encargada de decodificar el contenido de un JWT
import { Observable } from 'rxjs';                                // Flujos de datos asíncronos de la librería RxJS

/*
 * Registra el servicio en el inyector raíz, garantizando que el estado
 * de la sesión sea único y compartido por toda la aplicación.
 */
@Injectable({
  providedIn: 'root'
})

export class AuthService {

  // URL base de la API REST obtenida desde la configuración del entorno
  private readonly API_URL = environment.apiUrl;

  // Estado reactivo global que almacena la identidad del usuario autenticado
  currentUser = signal<User | null>(null);

  constructor(private http: HttpClient) {

    // Durante el arranque de la aplicación se verifica si existe una sesión previa
    this.checkTokenOnLoad();
  }

  /*****************************************************************************
  * GESTIÓN DE ACCESO Y REGISTRO
  *****************************************************************************/

  /*
   * Consulta si el sistema permite actualmente el registro de nuevos usuarios
   */
  checkRegistrationStatus(): Observable<any> {
    return this.http.get(`${this.API_URL}/auth/registration-status`);
  }

  /*
   * Registrar un nuevo usuario dentro de la plataforma
   */
  register(name: string, email: string, passwordPlain: string): Observable<any> {
    return this.http.post(`${this.API_URL}/auth/register`, { 
      name, 
      email, 
      password: passwordPlain 
    });
  }

  /*
   * Iniciar una sesión autenticada utilizando correo y contraseña
   */
  login(email: string, passwordPlain: string) {

    // Envía las credenciales al backend para su validación
    return this.http.post<AuthResponse>(`${this.API_URL}/auth/login`, {
      email,
      password: passwordPlain
    }).pipe(
      // Si la autenticación es correcta se almacena la sesión localmente
      tap(response => {

        // Verifica que la operación haya sido satisfactoria
        if (response.status === 'success') {

          // Guarda el JWT y la identidad del usuario
          this.setSession(response.data.token, response.data.user);
        }
      })
    );
  }

  /*
   * Finaliza la sesión activa eliminando cualquier información persistente
  */
  logout() {

    // Elimina el token almacenado en el navegador
    localStorage.removeItem('jwt_token');
    
    // Restablece el estado reactivo del usuario
    this.currentUser.set(null);
  }

  /*
   * Almacena una nueva sesión autenticada dentro del navegador
   */
  private setSession(token: string, user: User) {

    // Guarda el JWT para futuras peticiones autenticadas
    localStorage.setItem('jwt_token', token);

    // Actualiza la identidad activa de la aplicación
    this.currentUser.set(user);
  }

  
  /*
   * Modifica la contraseña temporal tras un reseteo de seguridad
   */
  changeForcedPassword(newPassword: string): Observable<any> {
    return this.http.post(`${this.API_URL}/auth/change-forced-password`, { newPassword });
  }

  /*****************************************************************************
  * RECUPERACIÓN DE CONTRASEÑA
  *****************************************************************************/

  /*
   * Pedir ayuda al administrador para recuperar una contraseña
   */
  requestAdminHelp(email: string): Observable<any> {
    return this.http.post(`${this.API_URL}/auth/forgot-password/admin`, { email });
  }

  /*
   * Solicita el envío de un PIN temporal al correo electrónico del usuario
   */
  requestEmailToken(email: string): Observable<any> {
    return this.http.post(`${this.API_URL}/auth/forgot-password/email`, { email });
  }

  /*
   * Restablece la contraseña utilizando un PIN temporal
   */
  resetPasswordWithToken(email: string, token: string, newPasswordPlain: string): Observable<any> {
    return this.http.post(`${this.API_URL}/auth/reset-password/email`, { 
      email, 
      token, 
      newPassword: newPasswordPlain 
    });
  }

  /*****************************************************************************
  * UTILIDADES Y GESTIÓN INTERNA DEL TOKEN
  *****************************************************************************/

  /*
   * Recupera el JWT actualmente almacenado en el navegador.
   */
  getToken(): string | null {
    return localStorage.getItem('jwt_token');
  }

  /*
   * Intenta reconstruir una sesión existente a partir del JWT almacenado
   */
  private checkTokenOnLoad() {

    // Recupera el token persistido en el navegador
    const token = localStorage.getItem('jwt_token');
    
    // Continúa únicamente si existe una sesión previa
    if (token) {
      try {
        
        // Decodifica el contenido interno del JWT
        const decodedToken: any = jwtDecode(token);

        // Comprueba si la fecha de expiración ya ha sido alcanzada
        const isExpired = decodedToken.exp * 1000 < Date.now();

        // Si el token ha expirado se invalida la sesión
        if (isExpired) {
          this.logout();

        // Reconstruye la identidad básica del usuario
        } else {
          this.currentUser.set({
            id: decodedToken.userId,
            name: decodedToken.name,
            email: decodedToken.email,
            role: decodedToken.role,
            force_password_change: decodedToken.force_password_change,
            is_active: true,
            tokens: 0 
          });
        }

      } catch (error) {

        // Si el JWT es inválido o está corrupto se elimina
        this.logout();
      }
    }
  }
}