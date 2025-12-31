// No necesitas el import si solo usas funciones globales
document.addEventListener('DOMContentLoaded', () => {
    const botonIndicador = document.getElementById('currentSectionLabel');

    if (botonIndicador) {
        botonIndicador.addEventListener('click', () => {
            // Verificamos que la función exista en el ámbito global (main.js)
            if (typeof openHelpModal === 'function') {
                // activeSection también es global
                openHelpModal(activeSection); 
            }
        });

        botonIndicador.style.cursor = "pointer";
        botonIndicador.title = "Click para ver ayuda de esta sección";
    }
});