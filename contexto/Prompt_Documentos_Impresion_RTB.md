Prompt_Documentos_Impresion_RTB.md


# Prompt maestro — Documentos RTB para IMPRESIÓN

**Refacciones Tomás Badillo, S.A. de C.V. · Sistema de diseño para piezas que se imprimen en papel**

Este archivo es el **gemelo impreso** de `Prompt_Documentos_RTB.md`. Aquel sirve para documentos que se leen en pantalla o se envían como PDF digital; **este sirve para piezas que van a salir físicamente por una impresora**: portadas de expediente, carátulas, formatos para llenar a mano, hojas de firma, señalización interna.

No son intercambiables. El archivo digital impreso sale lavado; el archivo de impresión en pantalla se ve sobresaturado. **Cada uno está bien en su medio.**

---

## Por qué existe este prompt

Durante la producción de la portada del Expediente Individual del Trabajador descubrimos tres cosas que arruinan cualquier documento RTB al imprimirse:

1. **Las transparencias se aplanan.** Un degradado hecho con `rgba()` u `opacity` sale del driver como una capa pálida y uniforme, sin degradado. Comprobado con una hoja de diagnóstico: la barra construida con color sólido imprimió un degradado perfecto; la barra equivalente con transparencia imprimió plana, con la saturación cayendo apenas de 59 a 51 de punta a punta.
2. **El teal se oscurece y vira al azul.** El teal RTB necesita mucho cian más una dosis de amarillo. Las impresoras de oficina aplican bien el cian pero se quedan cortas de amarillo, así que el color pierde lo verdoso y se va al azul petróleo. Además el papel bond absorbe y expande la tinta, lo que oscurece todo respecto a pantalla.
3. **El oro no existe en CMYK.** `#AD9551` sale como un beige plano. Hay que oscurecerlo para que lea como dorado.

Después, produciendo el manual operativo de fleteras, apareció una cuarta:

4. **Las negritas desaparecen dentro de los campos oscuros.** Las reglas globales del sistema pintan `strong`, `b`, `code`, `.quote` y `.tag` en navy. Sobre un campo navy eso da contraste **1.00** — el mismo color exacto que el fondo. En pantalla ya es invisible; impreso es una mancha uniforme. Se midieron siete elementos afectados, no uno.

Este prompt encapsula las cuatro soluciones.

---

## Cómo usarlo

1. Copia todo el bloque **"PROMPT PARA COPIAR"**.
2. Sustituye `[DESCRIBE AQUÍ LA PIEZA]` por lo que necesites.
3. Envía. El resultado es **un solo archivo `.html`** con la paleta calibrada W, listo para imprimir desde el navegador.

---

## PROMPT PARA COPIAR

> Necesito que generes una **pieza HTML autónoma** con la identidad visual de **Refacciones Tomás Badillo, S.A. de C.V. (RTB)**. Esta pieza **va a imprimirse en papel**, así que sigue el sistema de abajo sin reinterpretarlo, y respeta especialmente las reglas de impresión, que no son opcionales.
>
> **Pieza a crear:**
> [DESCRIBE AQUÍ LA PIEZA — tipo, contenido, tamaño de papel, si lleva campos para llenar a mano o firmas]
>
> ---
>
> ### Concepto rector
> "Flujo continuo": la promesa de la marca es *continuidad y cero riesgo de refaccionamiento*. El diseño lo traduce visualmente — el agua, la ola y la voluta dorada del logo. Elegante como el turismo, con rigor técnico e industrial. El ornamento válido es **la ola**, nunca formas ajenas al sistema.
>
> ---
>
> ### REGLA NÚMERO UNO — cero transparencias
>
> **Prohibido en toda la pieza:** `rgba()`, `opacity`, `filter`, `mix-blend-mode`, y degradados con paradas semitransparentes.
>
> Todo color debe ser **hexadecimal opaco**. Si necesitas un tono intermedio, **precalcúlalo mezclado contra el fondo real** y escríbelo como hex sólido. Los drivers aplanan la transparencia en una capa pálida uniforme y destruyen el degradado.
>
> Única excepción tolerada: trazos decorativos muy finos (líneas de corriente dentro de un campo de color), donde la transparencia de un `stroke` suele sobrevivir. Aun así, prefiere sólido si puedes.
>
> ---
>
> ### REGLA NÚMERO DOS — campos oscuros reafirman su texto
>
> Las reglas globales de este sistema pintan el texto en navy. Un campo con fondo navy **no basta con declarar su propio color**: la especificidad de las reglas globales gana sobre la herencia, así que las negritas, etiquetas, código y citas que vivan dentro heredan navy y quedan en contraste 1.00, invisibles.
>
> **Todo bloque con fondo oscuro debe reafirmar explícitamente los colores de texto de sus hijos.** Aplica a quiebres navy, encabezados de tabla, footers oscuros y cualquier componente nuevo que inventes con fondo saturado.
>
> Tonos obligatorios sobre campo navy `#002B5B`, todos **hex sólido, sin transparencia**:
>
> | Elemento | Color | Contraste |
> |---|---|---|
> | Texto corrido | `#CFE4E2` | 10.6 |
> | Negritas (`b`, `strong`) | `#FFFFFF` | 14.0 |
> | Cifras grandes | `#FFFFFF` | 14.0 |
> | Código | texto `#EAF4F3` sobre `#1F446F` | 9.9 |
> | Etiquetas (`.tag`) | texto `#FFFFFF` sobre `#2A4352` | 10.4 |
> | Enlaces | `#57C5B6` | 6.7 |
>
> Los fondos `#1F446F` y `#2A4352` ya vienen precalculados: son blanco al 12% y oro al 28% mezclados contra navy, resueltos a hex sólido para cumplir la regla número uno.
>
> ---
>
> ### REGLA NÚMERO TRES — la página mide en milímetros
>
> Al imprimir, `height:100%` **no resuelve contra nada**: el contenedor de la página pierde su altura fija, cualquier elemento anclado con `position:absolute; bottom:0` —el pie, por ejemplo— se sube encima del contenido, y la pieza se corta.
>
> La página se declara siempre en **medidas físicas**: `216mm × 279mm` para carta. Lo mismo `html` y `body`. Los elementos anclados al pie llevan `width:100%`, nunca un ancho fijo en píxeles.
>
> ```css
> html,body{width:216mm;height:279mm;margin:0;padding:0}
> .page{width:216mm;height:279mm;margin:0;overflow:hidden;page-break-after:avoid}
> ```
>
> Diseñar en la retícula de 816 × 1056 px sigue siendo correcto: a 96 dpi equivale exactamente a 8.5 × 11 pulgadas. Lo que no se vale es traducir esa retícula a porcentajes dentro de `@media print`.
>
> ---
>
> ### Paleta calibrada W — impresora de oficina
> Precompensada para una impresora que oscurece y pierde amarillo. **En pantalla se ve verde menta, no teal: es correcto.** Ese exceso de verde es lo que la impresora se come al imprimir.
> ```css
> :root{
>   --superficie:#D8F9E9;
>   --navy-medio:#1A5F7A;
>   --navy:#002B5B;
>   --oro:#957F3B;          /* OSCURECIDO — el #AD9551 digital imprime como beige */
>   --blanco:#FFFFFF;
> }
> ```
> Degradado calibrado, paradas opacas:
> ```css
> background:
>   radial-gradient(150% 118% at 50% -26%,
>     #63E8A8 0%, #6DE9AE 18%, #85EDBB 30%, #A0F1CA 40%,
>     #BCF5DA 49%, #D3F9E7 57%, #E6FBF1 65%, #F4FDF9 72%,
>     #FFFFFF 80%),
>   var(--blanco);
> ```
> Bandas de la ola: profunda `#D2F8E6` · clara `#EFFDF6` · blanco `#FFFFFF` · remate al pie `#E4FBF0`.
> Filo de tarjeta: hex sólido equivalente a `#18A874` al 26% sobre blanco.
>
> ---
>
> ### Disciplina de contraste (obligatoria)
> - Todo el **texto de lectura vive en navy**: `--navy` principal, `--navy-medio` secundario.
> - **Nunca uses oro en texto pequeño.** Sobre un campo teal saturado el oro da 2.2:1 — ilegible. El antetítulo del hero, que en el sistema digital va en oro, **en impresión va en navy**. El oro queda para la voluta, la regla, los filos de tarjeta y el logo.
> - Sobre campo oscuro, aplica la **regla número dos**.
> - Verifica cada bloque de texto: mínimo **4.5:1** contra su fondo real, medido sobre el render, no estimado.
>
> ### Tipografía
> Cargar por CDN: `Great Vibes`, `Playfair Display` (600, 700), `Inter` (400, 500, 600).
> - **Great Vibes** — script display, tamaño grande sobre fondo claro. Cuidado: tiene **remates que se salen de su caja**. Mide la tinta real, no el `bounding box`, y deja al menos **25 px de holgura** contra cualquier elemento arriba y abajo.
> - **Playfair Display** — titulares y subtítulos.
> - **Inter** — cuerpo, datos, etiquetas. Cifras tabulares en toda cifra: `font-variant-numeric: tabular-nums`.
>
> ### Geometría de página
> - Carta = **816 × 1056 px a 96 dpi**. Diseña en esa retícula exacta.
> - Pieza a sangre (portadas): `@page { size: letter; margin: 0 }`.
> - Pieza con margen (formatos, listados): `@page { size: letter; margin: 10–14mm }`.
> - `-webkit-print-color-adjust: exact; print-color-adjust: exact` siempre.
> - `break-inside: avoid` en tarjetas, tablas, bloques de firma y encabezados.
>
> ### Campos para llenar a mano
> - Línea de escritura: `border-bottom: 1.4px solid var(--navy-medio)`, altura mínima **20 px** para que quepa letra manuscrita.
> - Etiqueta arriba en versalitas Inter, 10–11 px, `--navy-medio`.
> - Casillas: cuadro de 16 px con borde de 1.6 px; la marcada se rellena en teal con palomita blanca.
>
> ---
>
> ### Protocolo de verificación (no lo omitas)
> Antes de entregar, **mide, no estimes**:
> 1. Renderiza con Playwright, **exporta un PDF de prueba con márgenes en cero y `prefer_css_page_size`, y cuenta las páginas**. Una portada debe dar exactamente 1. Ese PDF es solo para verificar; no se entrega.
> 2. **Rasteriza el PDF de prueba y mide la última fila con tinta.** Si hay tinta pegada al borde inferior, la pieza se está cortando. Revisar en el HTML de pantalla no basta: el corte solo aparece al imprimir.
> 3. Mide la **caja real de cada elemento** y confirma que ninguno se traslapa con la ola o los ornamentos.
> 4. Para tipografía script, **mide la tinta real** por bandas de píxeles, no el `bounding box`.
> 5. Calcula el **contraste real** de cada bloque de texto contra su fondo renderizado, con `getComputedStyle`. Por cada campo oscuro, confirma que las negritas **no** salgan en `#002B5B`.
> 6. Confirma que **no quedó ninguna transparencia** en el archivo final: busca `rgba(`, `opacity`, `filter` y `mix-blend-mode` en el HTML entregado y verifica que el resultado sea cero.
>
> ### Entrega
> Genera **un solo archivo `.html`** con la paleta calibrada W, guárdalo en la carpeta de salida y preséntamelo. No generes PDF.
>
> Nomenclatura: `[Pieza]_FINAL_W.html`

---

## Cómo imprimir la pieza

Como el entregable es HTML, el diálogo del navegador ya no es una variable oculta: hay que fijarlo bien una vez.

| Ajuste del navegador | Valor |
|---|---|
| Destino | La impresora, no "Guardar como PDF" |
| Papel | Carta |
| Márgenes | **Ninguno** en piezas a sangre · Predeterminado en piezas con margen |
| Gráficos de fondo | **Activado** — sin esto no imprime el degradado ni los campos de color |
| Escala | 100 %, nunca "Ajustar al área de impresión" |
| Encabezados y pies | Desactivados |

Si vas a mandar la pieza a imprenta o a una computadora ajena, exporta tú mismo el PDF desde ese diálogo con estos ajustes. El archivo HTML sigue siendo la fuente.

---

## Configuración de la impresora

Estos ajustes se aplican **encima** de lo que manda el archivo. Si no están en cero, pelean contra la compensación del diseño.

| Ajuste | Valor correcto | Por qué |
|---|---|---|
| Brillo | **0** | Cualquier valor positivo imprime todo más claro y lava el degradado |
| Contraste | **0** | Con brillo alto aplasta los tonos medios |
| Rojo · Verde · Azul | **0** | Corrigen el tono encima del archivo; +20 de azul enfría todo el teal |
| Mejorar color gris | **No** | Manda los tonos poco saturados a tóner negro; el teal claro entra en ese rango y sale gris |
| Mejorar impresión en negro | No | |
| Modo color | Intenso o Natural | Prueba ambos: Intenso a veces oscurece tintas ya cargadas |
| Calidad | Alta / Óptima | Nunca borrador |
| Ahorro de tóner | Desactivado | |
| Tipo de papel | Mate / Presentación | Baja la saturación de tinta y reduce la expansión |

Si imprimes desde la computadora, revisa que el driver no tenga **otro juego de ajustes propio** que se sume a los del equipo.

---

## Cómo calibrar una impresora nueva

Cuando cambies de equipo o de papel, la paleta W deja de servir. Repite este procedimiento:

1. **Descarta fallas de hardware primero.** Corre limpieza de cabezal y una página de prueba de inyectores. Si la franja amarilla sale entrecortada o pálida, ninguna corrección de archivo lo arregla.
2. **Imprime la hoja de diagnóstico** con parches de la paleta RTB, las cuatro tintas puras, una escala de grises y dos barras de degradado, una sólida y otra con transparencia. Diagnóstico:
   - Cian y magenta vivos pero el teal no → límite de gama, hay que precompensar.
   - Todo pálido, incluidas las tintas puras → falla de impresora, no de archivo.
   - Barra sólida bien y barra con transparencia plana → confirma la regla número uno.
3. **Imprime tiras de calibración** con 8 variantes del degradado real de la pieza, cada una con su barra de color puro arriba. Varía en tres tandas:
   - Tanda 1: luz y viveza general.
   - Tanda 2: más claras, si todas salieron oscuras.
   - Tanda 3: **carga de verde**, si el teal sale azul petróleo. Esta suele ser la buena.
4. **Juzga con luz de día**, nunca bajo foco amarillo y **nunca por escaneo** — el escáner levanta las sombras de forma notoria; llegó a leer un negro 100% como gris oscuro.
5. Fija la variante elegida y **desplaza en la misma proporción** todos los tonos derivados, para que la pieza quede armónica y no solo el fondo.

### Fórmula para regenerar tonos derivados

Todo el sistema se deriva de un solo color de origen `T` mezclado hacia blanco:

```python
POS  = [0, 18, 30, 40, 49, 57, 65, 72, 80]      # % del degradado
BLND = [0, .065, .22, .39, .57, .72, .84, .93, 1.0]   # mezcla hacia blanco

def blend(T, b):
    return [T[i] + (255 - T[i]) * b for i in range(3)]
```

Fracciones de mezcla de los elementos derivados:

| Elemento | Fracción |
|---|---|
| Banda profunda de la ola | 0.71 |
| Banda clara de la ola | 0.90 |
| Superficie de tarjeta / ficha | 0.75 |
| Remate al pie | 0.83 |

Con eso, cambiar el color de origen recalcula la pieza completa de forma coherente.

La misma función sirve para precalcular los tonos de campo oscuro de la regla número dos, cambiando el fondo de destino de blanco a navy:

```python
def blend_sobre(fg, bg, a):
    return [fg[i]*a + bg[i]*(1-a) for i in range(3)]
```

---

## Papel

Para portadas de expediente que van a estar en uso, el papel importa tanto como el archivo. **Opalina de 225 g o couché mate** en imprenta digital: el teal sale vivo y el papel no chupa la tinta. Pide impresión digital a color con perfil sRGB.

La paleta calibrada W está precompensada para la impresora de oficina sobre bond. Si la pieza va a imprenta, avísalo antes de generarla: el degradado tiene que recalcularse sin la carga de verde, o saldrá menta en lugar de teal.

---

## Kit de arranque

```css
:root{
  --superficie:#D8F9E9; --navy-medio:#1A5F7A; --navy:#002B5B;
  --oro:#957F3B; --blanco:#FFFFFF; --linea:#DCE3EC;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;color:var(--navy);
  font-variant-numeric:tabular-nums}
.page{position:relative;width:816px;height:1056px;overflow:hidden;background:var(--blanco)}
.num{font-variant-numeric:tabular-nums}
h1,h2,h3{font-family:'Playfair Display',serif}
.eyebrow{color:var(--navy);letter-spacing:.24em;text-transform:uppercase;
  font-size:11.5px;font-weight:600}                    /* navy, NO oro */
.gold-rule{width:120px;border-top:1.5px solid var(--oro);margin:26px auto;position:relative}
.gold-rule::after{content:"";position:absolute;left:50%;top:-3px;transform:translateX(-50%);
  width:6px;height:6px;border-radius:50%;background:var(--oro)}
.ficha{background:var(--superficie);border:1px solid #7FC4BC;
  border-left:4px solid var(--oro);border-radius:14px;padding:20px 30px}
.fline{border-bottom:1.4px solid var(--navy-medio);min-height:20px}

/* REGLA NÚMERO DOS — campo oscuro reafirma su texto.
   Hex sólido, sin transparencia. No borrar: sin esto las negritas
   quedan navy sobre navy, contraste 1.00, invisibles. */
.campo-oscuro{background:var(--navy);color:#CFE4E2}
.campo-oscuro p,.campo-oscuro li{color:#CFE4E2}
.campo-oscuro b,.campo-oscuro strong{color:#FFFFFF;font-weight:700}
.campo-oscuro .big{color:#FFFFFF}
.campo-oscuro code{color:#EAF4F3;background:#1F446F}
.campo-oscuro .quote{color:#EAF4F3;border-left:4px solid var(--oro)}
.campo-oscuro a{color:#57C5B6}
.campo-oscuro .tag{background:#2A4352;border:1px solid var(--oro);color:#FFFFFF}
thead th b,thead th strong{color:#FFFFFF}

@media print{
  @page{size:letter;margin:0}
  /* ALTURA FÍSICA, NO PORCENTUAL — height:100% no resuelve contra nada al
     imprimir: la página pierde su alto fijo, el pie anclado con bottom:0
     se sube encima del contenido y la pieza se corta. No cambiar a %. */
  html,body{width:216mm;height:279mm;margin:0;padding:0;background:var(--blanco)}
  .page{width:216mm;height:279mm;margin:0;overflow:hidden;page-break-after:avoid}
  .foot{width:100%}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ficha,.card,.sec-head,.campo-oscuro{break-inside:avoid}
}
```

Generación de la ola, con relleno sólido:

```python
import math
def wave_pts(W, base, amp, cycles, phase, tilt=0.0, steps=180):
    return [(W*i/steps,
             base + amp*math.sin(2*math.pi*cycles*(i/steps)+phase) + tilt*(i/steps))
            for i in range(steps+1)]

def wave_fill(W, H, base, amp, cycles, phase, tilt=0.0):
    p = wave_pts(W, base, amp, cycles, phase, tilt)
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in p)
    return d + f" L {W} {H} L 0 {H} Z"
```

El SVG que contiene la ola debe llevar `preserveAspectRatio="none"` y abarcar el **ancho completo** de la hoja. Una ola anclada a una esquina y de ancho parcial produce un corte visible.

---

*Sistema de diseño para impresión · Refacciones Tomás Badillo, S.A. de C.V. · Complemento de `Prompt_Documentos_RTB.md` · Calibración W · V2.1 · 2026*
