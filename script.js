// constantes principales del proyecto segun los requisitos
const CLAVE_STORAGE = "historias_efimeras_v1";
const DURACION_HISTORIA_MS = 3000; // 3 segundos por cada historia
const HORAS_24_MS = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
const DEMO_15_SEG_MS = 15 * 1000; // 15 seg pa probar rapido en clase
const ANCHO_MAXIMO = 1080;
const ALTO_MAXIMO = 1920;

// referencias a los elementos del html
const botonSubir = document.getElementById("boton-subir");
const entradaArchivo = document.getElementById("entrada-archivo");
const contenedorLista = document.getElementById("contenedor-lista-historias");
const textoEstado = document.getElementById("texto-estado");
const checkModoPrueba = document.getElementById("modo-prueba");

const visorModal = document.getElementById("visor-modal");
const barrasProgreso = document.getElementById("barras-progreso");
const imagenVisor = document.getElementById("imagen-visor");
const tiempoTranscurrido = document.getElementById("tiempo-transcurrido");
const botonCerrarVisor = document.getElementById("boton-cerrar-visor");
const botonEliminarActual = document.getElementById("boton-eliminar-actual");
const toqueIzquierda = document.getElementById("toque-izquierda");
const toqueDerecha = document.getElementById("toque-derecha");
const areaDeslizamiento = document.getElementById("area-deslizamiento");

// variables de estado mientras se ven las historias
let historiasActivas = [];
let indiceActual = 0;
let temporizadorAvance = null;
let inicioToqueX = 0;

// devuelve cuanto tiempo dura viva una historia (24h normal o 15s en modo demo)
function obtenerTiempoExpiracion() {
  return checkModoPrueba.checked ? DEMO_15_SEG_MS : HORAS_24_MS;
}

// lee las historias del localStorage y borra las que ya vencieron
function cargarYLimpiarHistorias() {
  const datosGuardados = localStorage.getItem(CLAVE_STORAGE);
  const lista = datosGuardados ? JSON.parse(datosGuardados) : [];
  const ahora = Date.now();
  const limiteVida = obtenerTiempoExpiracion();

  // filtramos solo las q todavia no pasan el tiempo limite
  const vigentes = lista.filter((historia) => (ahora - historia.creadaEn) < limiteVida);

  // si se borro alguna por vieja actualizamos el storage de una vez
  if (vigentes.length !== lista.length) {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(vigentes));
  }

  historiasActivas = vigentes;
  return vigentes;
}

// dibuja las bolitas de las historias en la barra superior
function renderizarListaHistorias() {
  const lista = cargarYLimpiarHistorias();
  contenedorLista.innerHTML = "";

  // actualiza el subtitulo segun cuantas hayan (0, 1 o varias)
  if (lista.length === 0) {
    textoEstado.textContent = "Sin historias activas";
  } else if (lista.length === 1) {
    textoEstado.textContent = "1 historia activa";
  } else {
    textoEstado.textContent = `${lista.length} historias activas`;
  }

  lista.forEach((historia, indice) => {
    const botonItem = document.createElement("button");
    botonItem.type = "button";
    botonItem.className = "item-historia";
    botonItem.setAttribute("aria-label", `Ver historia ${indice + 1}`);

    botonItem.innerHTML = `
      <div class="aro-historia">
        <img src="${historia.imagenBase64}" alt="Historia ${indice + 1}" class="miniatura-historia">
      </div>
      <span class="etiqueta-historia">${formatearTiempoCorto(historia.creadaEn)}</span>
    `;

    // al darle clic abre el visor justo en esa historia
    botonItem.addEventListener("click", () => abrirVisor(indice));
    contenedorLista.appendChild(botonItem);
  });
}

// redimensiona la imagen a max 1080x1920 usando canvas y la pasa a base64
function procesarImagenABase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();

    lector.onload = (evento) => {
      const img = new Image();
      img.onload = () => {
        let ancho = img.width;
        let alto = img.height;

        // si la foto es mas grande q 1080x1920 la achicamos manteniendo proporcion
        const escala = Math.min(ANCHO_MAXIMO / ancho, ALTO_MAXIMO / alto, 1);
        ancho = Math.round(ancho * escala);
        alto = Math.round(alto * escala);

        const lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto;

        const ctx = lienzo.getContext("2d");
        ctx.drawImage(img, 0, 0, ancho, alto);

        // exportamos en jpeg calidad 0.85 pa no llenar tan rapido los 5MB de localStorage
        const base64Optimizado = lienzo.toDataURL("image/jpeg", 0.85);
        resolve(base64Optimizado);
      };
      img.onerror = reject;
      img.src = evento.target.result;
    };

    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

// abre el selector de archivos cuando tocan el boton +
botonSubir.addEventListener("click", () => {
  entradaArchivo.click();
});

// cuando el usuario escoge una imagen la procesamos y la guardamos
entradaArchivo.addEventListener("change", async (evento) => {
  const archivo = evento.target.files[0];
  if (!archivo) return;

  try {
    const imagenBase64 = await procesarImagenABase64(archivo);
    const listaActual = cargarYLimpiarHistorias();

    const nuevaHistoria = {
      id: Date.now(),
      imagenBase64: imagenBase64,
      creadaEn: Date.now()
    };

    listaActual.push(nuevaHistoria);
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(listaActual));

    renderizarListaHistorias();
  } catch (error) {
    alert("No se pudo guardar la imagen. Puede que el almacenamiento local este lleno.");
    console.error(error);
  } finally {
    // limpiamos el input pa poder subir la misma foto dos veces seguidas si queremos
    entradaArchivo.value = "";
  }
});

// abre el visor y arranca la reproduccion desde el indice seleccionado
function abrirVisor(indice) {
  cargarYLimpiarHistorias();
  if (historiasActivas.length === 0) return;

  indiceActual = indice;
  visorModal.classList.remove("oculto");
  mostrarHistoriaActual();
}

// cierra el visor y mata el temporizador pa q no siga corriendo por debajo
function cerrarVisor() {
  visorModal.classList.add("oculto");
  clearTimeout(temporizadorAvance);
  renderizarListaHistorias();
}

// pinta las barritas de arriba y carga la foto que toca
function mostrarHistoriaActual() {
  clearTimeout(temporizadorAvance);

  // si ya pasamos la ultima historia cerramos el visor
  if (indiceActual >= historiasActivas.length) {
    cerrarVisor();
    return;
  }

  // si retroceden estando en la primera se queda en la 0
  if (indiceActual < 0) {
    indiceActual = 0;
  }

  const historia = historiasActivas[indiceActual];
  imagenVisor.src = historia.imagenBase64;
  tiempoTranscurrido.textContent = formatearTiempoCorto(historia.creadaEn);

  // creamos una barra individual por cada historia activa
  barrasProgreso.innerHTML = "";
  historiasActivas.forEach((_, idx) => {
    const segmento = document.createElement("div");
    segmento.className = "barra-segmento";

    const relleno = document.createElement("div");
    relleno.className = "barra-relleno";

    if (idx < indiceActual) {
      // las anteriores ya quedan llenas al 100%
      relleno.style.width = "100%";
    } else if (idx === indiceActual) {
      // la actual se anima de 0 a 100% en exactamente 3 segundos
      relleno.style.width = "0%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          relleno.style.transition = `width ${DURACION_HISTORIA_MS}ms linear`;
          relleno.style.width = "100%";
        });
      });
    }

    segmento.appendChild(relleno);
    barrasProgreso.appendChild(segmento);
  });

  // programa el salto automatico a la siguiente historia a los 3 seg
  temporizadorAvance = setTimeout(() => {
    indiceActual++;
    mostrarHistoriaActual();
  }, DURACION_HISTORIA_MS);
}

// texto amigable pa saber hace cuanto se subio
function formatearTiempoCorto(timestamp) {
  const segundos = Math.floor((Date.now() - timestamp) / 1000);
  if (segundos < 60) return `Hace ${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `Hace ${minutos}m`;
  const horas = Math.floor(minutos / 60);
  return `Hace ${horas}h`;
}

// controles de navegacion por clic en los lados
toqueDerecha.addEventListener("click", () => {
  indiceActual++;
  mostrarHistoriaActual();
});

toqueIzquierda.addEventListener("click", () => {
  indiceActual--;
  mostrarHistoriaActual();
});

botonCerrarVisor.addEventListener("click", cerrarVisor);

// permite borrar manualmente la historia que se esta viendo
botonEliminarActual.addEventListener("click", () => {
  historiasActivas.splice(indiceActual, 1);
  localStorage.setItem(CLAVE_STORAGE, JSON.stringify(historiasActivas));

  if (historiasActivas.length === 0) {
    cerrarVisor();
  } else {
    if (indiceActual >= historiasActivas.length) {
      indiceActual = historiasActivas.length - 1;
    }
    mostrarHistoriaActual();
  }
});

// soporte para deslizar (swipe) tanto en pantallas tactiles como con el mouse
areaDeslizamiento.addEventListener("touchstart", (e) => {
  inicioToqueX = e.changedTouches[0].screenX;
}, { passive: true });

areaDeslizamiento.addEventListener("touchend", (e) => {
  const finToqueX = e.changedTouches[0].screenX;
  evaluarDeslizamiento(inicioToqueX, finToqueX);
}, { passive: true });

areaDeslizamiento.addEventListener("mousedown", (e) => {
  inicioToqueX = e.clientX;
});

areaDeslizamiento.addEventListener("mouseup", (e) => {
  evaluarDeslizamiento(inicioToqueX, e.clientX);
});

function evaluarDeslizamiento(inicio, fin) {
  const diferencia = fin - inicio;
  // si deslizo mas de 45 pixeles cambiamos de historia
  if (diferencia < -45) {
    indiceActual++;
    mostrarHistoriaActual();
  } else if (diferencia > 45) {
    indiceActual--;
    mostrarHistoriaActual();
  }
}

// revision automatica cada segundo pa limpiar historias expiradas en vivo
setInterval(() => {
  const antes = historiasActivas.length;
  const vigentes = cargarYLimpiarHistorias();

  if (vigentes.length !== antes) {
    renderizarListaHistorias();
    // si estaba abierto el visor y vencio una historia, lo cerramos pa evitar errores
    if (!visorModal.classList.contains("oculto")) {
      cerrarVisor();
    }
  }
}, 1000);

// si cambian el switch de modo demo refrescamos de una
checkModoPrueba.addEventListener("change", renderizarListaHistorias);

// arranque inicial al abrir la pagina
renderizarListaHistorias();