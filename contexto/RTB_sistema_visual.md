# Sistema de Identidad Visual — Refacciones Tomás Badillo

**Documento de decisiones de diseño de marca · V1.0 · 2026**

> Este documento reúne las decisiones visuales y de diseño de la marca: el concepto rector, el logotipo y sus usos, el sistema cromático, la tipografía, el lenguaje de movimiento y las reglas de estructura. Es la referencia para mantener coherencia en portadas, páginas, presentaciones y documentos.

---

## 1. Concepto rector — "Flujo continuo"

El eje visual de la marca traduce su promesa comercial —**la continuidad y el cero riesgo de refaccionamiento**— a un lenguaje que se puede ver y sentir.

- La promesa es que *la refacción nunca deja de existir y la operación nunca se detiene*.
- El mundo de producto es agua: grifería, filtración, plomería. El propio logo ya lo dice, con una llave y una onda dorada que fluye.
- Por eso el movimiento no es decorativo: **todo fluye como el agua y nunca se detiene = la promesa hecha visible.**

Todas las decisiones de abajo (color, tipografía, animación, estructura) se derivan de esta idea.

---

## 2. Logotipo

**Descripción.** Monograma "RTB" en serif elegante, con una llave (grifería) y una voluta/onda dorada, rodeado por el texto circular "REFACCIONES TOMÁS BADILLO SA DE CV".

**Regla de fondo transparente.** El logo se usa en **PNG con fondo transparente** (sin caja blanca), para que se asiente limpio sobre cualquier fondo —blanco, degradado teal o navy—.

**Usos según el espacio:**

| Contexto | Versión | Notas |
|---|---|---|
| Portada / hero | Logo completo, grande | Es la corona de la portada; entra con animación suave y flote sutil |
| Footer / cierre | Logo completo, mediano | Refuerzo de marca al pie |
| Barra de navegación | Logo reducido (~40–48 px) | A ese tamaño el texto circular no se lee; funciona como emblema reconocible |

**Pendientes recomendados:**

- Conseguir el **archivo vectorial (SVG / AI)** con el que se diseñó el logo, para escalar sin pixelearse (portadas grandes, impresión) y para poder animar la llave y la onda por separado.
- Crear una **variante compacta** (solo el monograma RTB, sin el texto circular) para espacios pequeños como la barra de navegación o favicons.

---

## 3. Sistema cromático

**Regla mental:** **teal y oro seducen · navy comunica · blanco respira.**

| Color | HEX | Rol |
|---|---|---|
| Teal | `#159895` | Primario · marca · elementos grandes |
| Teal claro | `#57C5B6` | Primario claro · degradados · resplandores |
| Blanco | `#FFFFFF` | **Fondo base del sitio · lienzo principal** |
| Superficie | `#EEF8F7` | Tarjetas y piezas que resaltan sobre el blanco (teal muy claro) |
| Navy medio | `#1A5F7A` | Texto secundario · subtítulos · líneas |
| Navy | `#002B5B` | Texto principal · alto contraste |
| Oro | `#AD9551` | Acento de lujo · remates finos · la onda |

**Guía de contraste (importante):**

- **`#57C5B6` y `#AD9551`** tienen bajo contraste sobre fondo claro: son ideales para **bloques grandes, degradados, iconos y remates**, *no* para texto pequeño.
- **El texto de lectura vive en navy** (`#002B5B` para principal, `#1A5F7A` para secundario). Ahí está la legibilidad.
- `#159895` funciona para **títulos grandes y elementos de UI**, no para párrafos largos.

**Fondo base y jerarquía de superficies:**

- El **lienzo** de la página es **blanco** `#FFFFFF`.
- Las **tarjetas y piezas** que deben destacar van en una **superficie teal muy clara** `#EEF8F7`, para que floten sobre el blanco y aporten el toque de color.
- Las **secciones oscuras** (navy `#002B5B`) funcionan como quiebre/respiro entre bloques claros.

**Degradado del hero:** resplandor teal (`#57C5B6` / `#159895`) concentrado en la parte superior, difuminándose hacia el fondo base blanco abajo. La ola de continuidad cierra el hero. El logo transparente se asienta sobre todo ello sin caja.

---

## 4. Sistema tipográfico

Tres niveles, cada voz con un trabajo distinto: **una para seducir, otra para titular, otra para informar.**

| Tipografía | Nivel | Uso | Pesos / detalles |
|---|---|---|---|
| **Great Vibes** | Display / script | **Solo** portada y hero, tamaño grande, fondo claro (el nombre de la marca) | Regular |
| **Playfair Display** | Titulares | Encabezados y subtítulos | 600–700 |
| **Inter** | Texto y datos | Cuerpo, tablas, etiquetas, fichas, facturas, documentos internos | 400 / 500 / 600 · **cifras tabulares activadas** |

**Notas de uso:**

- **Great Vibes** es un gesto elegante de marca; por legibilidad se limita a portadas y títulos hero grandes sobre fondo claro. No usar en texto corrido.
- **Playfair Display** carga todos los titulares y subtítulos, y aporta el aire de hospitalidad.
- **Inter** hace el trabajo de lectura y datos. Con **cifras tabulares** (`font-variant-numeric: tabular-nums`) los números quedan alineados en columnas — clave para fichas y facturas, p. ej. `$ 12,480.00 · 1,250 pzas · 02420`.

La mezcla de un serif/script elegante con una grotesca moderna resuelve la tensión de la marca: **elegante como el turismo, pero con rigor técnico e industrial.**

---

## 5. Movimiento y animación

**Principio:** el movimiento *significa* continuidad. Nada se detiene, todo fluye — la promesa comercial vuelta lenguaje visual.

**Inspiración de referencia:** la fluidez del sitio de Alsea — scroll cinematográfico y narrativo, con una historia que se revela sola al bajar, números grandes que cuentan, imágenes por capas y un deslizamiento suave con inercia.

**Técnicas del sistema:**

- **Scroll suave con inercia** ("gliding") en toda la página — es lo que más aporta la sensación fluida.
- **Barra de progreso** superior (teal → oro) que se llena al bajar = línea de continuidad.
- **Narrativa que se construye** paso a paso con el scroll (una frase que se arma conforme bajas).
- **Reveladores en cascada** de tarjetas y secciones (fade + desplazamiento suave, escalonados).
- **Contadores animados** con cifras tabulares.
- **Parallax por capas** (elementos que se mueven a distinta velocidad).
- **Ola de continuidad** que fluye sin parar al fondo del hero.
- **Micro-interacciones** en hover (tarjetas que suben, subrayados que crecen).
- **Entrada del logo** (aparición suave + flote muy sutil) y **línea ondulada dorada** que se dibuja sola (efecto de trazo).

**Accesibilidad y robustez:**

- Respetar `prefers-reduced-motion`: suavizar parallax y bucles infinitos sin apagar todo.
- Malla de seguridad para que el contenido siempre aparezca aunque el visor no haga scroll o bloquee scripts (fallback sin JS).
- El deslizamiento con inercia degrada con elegancia a scroll nativo si no hay conexión.

---

## 6. Estructura y layout

**Jerarquía de la portada / hero (de arriba hacia abajo):**

1. **Logo** (completo, grande)
2. **"Manual de identidad de marca"** — antetítulo en oro, versalitas espaciadas (Inter)
3. **"Refacciones Tomás Badillo"** — nombre en Great Vibes, grande
4. **"S.A. de C.V."** — subtítulo en Playfair, espaciado
5. **Línea ondulada dorada** — divisor que se dibuja al cargar (hace eco de la onda del logo)
6. **Línea meta al pie** — "Refacciones automotrices · Material de plomería · V1.0 · 2026" (Inter, versalitas)

**Reglas generales de composición:**

- El fondo blanco es el lienzo; las **tarjetas en teal muy claro** (`#EEF8F7`) flotan encima; las **secciones navy** dan el respiro.
- El **divisor ondulado dorado** se usa como remate elegante entre bloques, en lugar de una línea recta.
- El logo, al ser transparente, se coloca sobre cualquier fondo o degradado sin caja.

---

## 7. Guía rápida — sí / no

**Sí:**

- Texto de lectura en navy; teal y oro para bloques, iconos y remates.
- Tarjetas en superficie teal clara (`#EEF8F7`) sobre el fondo blanco para que resalten.
- Great Vibes solo en portadas/hero grandes.
- Inter con cifras tabulares para cualquier dato numérico.
- Logo en PNG transparente (o SVG cuando exista).

**No:**

- Texto pequeño en `#57C5B6` o `#AD9551` sobre fondo claro (bajo contraste).
- Great Vibes en texto corrido o tamaños pequeños.
- Logo con caja blanca sobre fondos de color.
- Animación que se sienta pausada o entrecortada; el movimiento debe fluir.

---

## Referencia técnica

**Paleta (HEX):** `#159895` · `#57C5B6` · `#FFFFFF` · `#EEF8F7` · `#1A5F7A` · `#002B5B` · `#AD9551`

**Tipografías:** Great Vibes (display/script) · Playfair Display (titulares, 600–700) · Inter (texto/datos, 400/500/600, tabular-nums)

**Concepto:** Flujo continuo — continuidad y cero riesgo, hechos visibles.

---

*Sistema de identidad visual · Refacciones Tomás Badillo, S.A. de C.V. · Proyecto de reestructuración*
