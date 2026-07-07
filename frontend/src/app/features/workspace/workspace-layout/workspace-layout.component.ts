/*******************************************************************************
 * ARCHIVO: workspace-layout.component.ts                                      *
 * AUTOR: Raúl Vázquez Rodríguez                                               *
 *                                                                             *
 * DESCRIPCIÓN:                                                                *
 * Componente estructural (layout) que orquesta la vista principal del         *
 * entorno de trabajo (workspace). Integra el explorador de archivos, el       *
 * editor de código CUDA y la guía interactiva de ejemplos para facilitar      *
 * el aprendizaje y la ejecución de programas.                                 *
 *******************************************************************************/

import { Component, signal } from '@angular/core';                                      // Decorador de componente y señales reactivas de Angular
import { CommonModule } from '@angular/common';                                         // Directivas comunes de Angular
import { HeaderComponent } from '../../../shared/layouts/header/header.component';      // Componente visual de cabecera
import { SidenavComponent } from '../../../shared/layouts/sidenav/sidenav.component';   // Componente visual del menú lateral de navegación
import { FileManagerComponent } from '../file-manager/file-manager.component';          // Componente encargado de la gestión de archivos del usuario
import { CodeEditorComponent } from '../code-editor/code-editor.component';             // Componente encargado de la edición y ejecución de código CUDA

// Define las distintas pestañas disponibles dentro de la guía
type GuideTab = 'code' | 'execution' | 'storage';

/*
 * Componente principal encargado de organizar todas las herramientas 
 * disponibles dentro del entorno de trabajo del usuario
 */
@Component({

    // Selector utilizado por Angular para renderizar el componente
    selector: 'app-workspace-layout',

    // Define el componente como Standalone
    standalone: true,
    
    // Componentes utilizados dentro de la plantilla
    imports: [CommonModule, HeaderComponent, SidenavComponent, FileManagerComponent, CodeEditorComponent],

    // Plantilla HTML asociada
    templateUrl: './workspace-layout.component.html'
})

export class WorkspaceLayoutComponent {

    /***************************************************************************
     * ESTADOS REACTIVOS DE LA GUÍA
     ***************************************************************************/
    
    // Controla si la guía está abierta
    isGuideOpen = signal<boolean>(false);

    // Almacena la pestaña activa actualmente
    activeGuideTab = signal<GuideTab>('code');

    // Guarda el identificador del fragmento de código copiado
    copiedCode = signal<string | null>(null);

    // Controla qué código está abierto actualmente en la interfaaz
    expandedSnippet = signal<string | null>(null);


    /***************************************************************************
     * FRAGMENTOS DE CÓDIGO DE EJEMPLO
     ***************************************************************************/
    
    /*
     * Ejemplo de suma vectorial
     */
    snippetVectorAdd = `#include <iostream>

__global__ void vectorAdd(const float *A, const float *B, float *C, int numElements) {
    int i = blockDim.x * blockIdx.x + threadIdx.x;
    if (i < numElements) {
        C[i] = A[i] + B[i];
    }
}

int main() {
    int numElements = 50000;
    size_t size = numElements * sizeof(float);

    float *h_A = new float[numElements];
    float *h_B = new float[numElements];
    float *h_C = new float[numElements];

    for (int i = 0; i < numElements; ++i) {
        h_A[i] = 1.0f; h_B[i] = 2.0f;
    }

    float *d_A, *d_B, *d_C;
    cudaMalloc((void **)&d_A, size);
    cudaMalloc((void **)&d_B, size);
    cudaMalloc((void **)&d_C, size);

    cudaMemcpy(d_A, h_A, size, cudaMemcpyHostToDevice);
    cudaMemcpy(d_B, h_B, size, cudaMemcpyHostToDevice);

    int threadsPerBlock = 256;
    int blocksPerGrid = (numElements + threadsPerBlock - 1) / threadsPerBlock;
    vectorAdd<<<blocksPerGrid, threadsPerBlock>>>(d_A, d_B, d_C, numElements);
    cudaDeviceSynchronize();

    cudaMemcpy(h_C, d_C, size, cudaMemcpyDeviceToHost);

    std::cout << "Suma en GPU completada. Resultado [0]: " << h_C[0] << std::endl;

    cudaFree(d_A); cudaFree(d_B); cudaFree(d_C);
    delete[] h_A; delete[] h_B; delete[] h_C;

    return 0;
}`;


    /*
     * Ejemplo básico de ejecución CUDA
     */
    snippetHelloWorld = `#include <iostream>

__global__ void helloCuda() {
    printf("¡Hola desde el Hilo %d de la GPU CUDA!\\n", threadIdx.x);
}

int main() {
    std::cout << "Iniciando motor CUDA..." << std::endl;
    
    // Lanzamos 1 bloque con 5 hilos
    helloCuda<<<1, 5>>>();
    
    // Esperamos a que la GPU termine
    cudaDeviceSynchronize();
    
    std::cout << "Ejecución completada." << std::endl;
    return 0;
}`;

    /*
     * Ejemplo convertir imagen a blanco y negro
     */
    snippetGrayscale = `#include <iostream>
// NOTA: Para usar este código, sube una imagen llamada 'paisaje.bmp' 
// a tus archivos personales y asegúrate de tener espacio.

#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cstdint>
#include <cstring>
#include <cuda_runtime.h>

#pragma pack(push, 1)

struct BMPFileHeader {
    uint16_t fileType{ 0x4D42 };
    uint32_t fileSize{ 0 };
    uint16_t reserved1{ 0 };
    uint16_t reserved2{ 0 };
    uint32_t offsetData{ 0 };
};

struct BMPInfoHeader {
    uint32_t size{ 0 };
    int32_t width{ 0 };
    int32_t height{ 0 };
    uint16_t planes{ 1 };
    uint16_t bitCount{ 0 };
    uint32_t compression{ 0 };
    uint32_t sizeImage{ 0 };
    int32_t xPixelsPerMeter{ 0 };
    int32_t yPixelsPerMeter{ 0 };
    uint32_t colorsUsed{ 0 };
    uint32_t colorsImportant{ 0 };
};

#pragma pack(pop)

__global__
void rgbToGray(uint8_t* input, uint8_t* output, int width, int height)
{
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;

    if (x >= width || y >= height)
        return;

    int idx = (y * width + x) * 3;

    uint8_t b = input[idx];
    uint8_t g = input[idx + 1];
    uint8_t r = input[idx + 2];

    uint8_t gray = static_cast<uint8_t>(
        0.299f * r +
        0.587f * g +
        0.114f * b
    );

    output[idx]     = gray;
    output[idx + 1] = gray;
    output[idx + 2] = gray;
}

int main()
{
    std::string inputName = "paisaje.bmp";
    std::string outputName = "paisaje_byn.bmp";

    std::ifstream file(inputName, std::ios::binary);

    if (!file) {
        std::cerr << "Error: No se pudo abrir el archivo." << std::endl;
        return 1;
    }

    BMPFileHeader fileHeader;
    BMPInfoHeader infoHeader;

    file.read(reinterpret_cast<char*>(&fileHeader), sizeof(fileHeader));
    file.read(reinterpret_cast<char*>(&infoHeader), sizeof(infoHeader));

    if (fileHeader.fileType != 0x4D42) {
        std::cerr << "Error: No es un archivo BMP." << std::endl;
        return 1;
    }

    if (infoHeader.bitCount != 24 || infoHeader.compression != 0) {
        std::cerr << "Error: Solo BMP de 24 bits sin compresion." << std::endl;
        return 1;
    }

    int width = infoHeader.width;
    int height = abs(infoHeader.height);

    // Cada fila BMP debe alinearse a múltiplos de 4 bytes
    int rowSize = (width * 3 + 3) & (~3);
    int dataSize = rowSize * height;

    std::vector<uint8_t> inputData(dataSize);

    file.seekg(fileHeader.offsetData, std::ios::beg);
    file.read(reinterpret_cast<char*>(inputData.data()), dataSize);
    file.close();

    // Remover padding para CUDA
    std::vector<uint8_t> compactInput(width * height * 3);

    for (int y = 0; y < height; y++) {
        memcpy(
            &compactInput[y * width * 3],
            &inputData[y * rowSize],
            width * 3
        );
    }

    std::vector<uint8_t> compactOutput(width * height * 3);

    uint8_t* d_input = nullptr;
    uint8_t* d_output = nullptr;

    size_t size = width * height * 3;

    cudaMalloc((void**)&d_input, size);
    cudaMalloc((void**)&d_output, size);

    cudaMemcpy(
        d_input,
        compactInput.data(),
        size,
        cudaMemcpyHostToDevice
    );

    dim3 block(16, 16);

    dim3 grid(
        (width + block.x - 1) / block.x,
        (height + block.y - 1) / block.y
    );

    rgbToGray<<<grid, block>>>(
        d_input,
        d_output,
        width,
        height
    );

    cudaDeviceSynchronize();

    cudaMemcpy(
        compactOutput.data(),
        d_output,
        size,
        cudaMemcpyDeviceToHost
    );

    cudaFree(d_input);
    cudaFree(d_output);

    // Restaurar padding BMP
    std::vector<uint8_t> finalData(dataSize);

    for (int y = 0; y < height; y++) {
        memcpy(
            &finalData[y * rowSize],
            &compactOutput[y * width * 3],
            width * 3
        );
    }

    infoHeader.sizeImage = dataSize;

    fileHeader.fileSize =
        sizeof(BMPFileHeader) +
        sizeof(BMPInfoHeader) +
        dataSize;

    std::ofstream outFile(outputName, std::ios::binary);

    outFile.write(
        reinterpret_cast<char*>(&fileHeader),
        sizeof(fileHeader)
    );

    outFile.write(
        reinterpret_cast<char*>(&infoHeader),
        sizeof(infoHeader)
    );

    outFile.write(
        reinterpret_cast<char*>(finalData.data()),
        dataSize
    );

    outFile.close();

    std::cout << "Imagen convertida con CUDA: "
            << outputName << std::endl;

    return 0;
}`;

    /*
     * Copia al portapapeles el contenido del ejemplo y muestra confirmación
     */
    copyToClipboard(code: string, snippetId: string) {

        // Copia el contenido recibido al portapapeles del navegador
        navigator.clipboard.writeText(code).then(() => {

            // Marca como copiado para actualizar interfaz
            this.copiedCode.set(snippetId);

            // Elimina confirmación ras unos segundos
            setTimeout(() => this.copiedCode.set(null), 3000);
        });
    }
}