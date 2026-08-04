
# Documento Maestro — Refacciones Tomás Badillo
 
**Referencia técnica y editorial del archivo `RTB_documento_maestro.html` · V1.0 · 2026**
 
> Este documento describe el archivo HTML maestro que consolida los cuatro pilares del proyecto de reestructuración —Marco de Identidad Empresarial, Análisis Competitivo, Estrategia de Negocio y Sistema de Identidad Visual— en una sola página autónoma y navegable. Sirve como referencia de su estructura, sus decisiones de diseño y su mantenimiento.
 
---
 
## 1. Propósito y alcance
 
El documento maestro es la pieza única que reúne y presenta todo lo definido en el proyecto de reestructuración. Es un archivo **completamente autónomo**: el logotipo va incrustado en base64, los estilos y la interacción viven en el propio archivo, y la única dependencia externa son las tipografías de Google Fonts y la librería Lenis (ambas por CDN, con degradación elegante si no cargan). Puede abrirse, enviarse o publicarse sin archivos adjuntos.
 
**Fuentes de contenido:** `Identidad_Empresarial.md` · `Analisis_Competitivo.md` · `Estrategia_de_Negocio.md` · `RTB_sistema_visual.md`
 
---
 
## 2. Estructura del documento
 
La página se organiza en cinco partes, ancladas desde la barra de navegación, con tres quiebres navy que marcan los momentos clave de la narrativa.
 
| # | Sección | Ancla | Contenido |
|---|---|---|---|
| — | Hero | — | Logo, nombre en Great Vibes, lema y línea meta sobre las olas |
| I | Identidad | `#identidad` | Las cinco preguntas del marco de identidad |
| ◆ | Quiebre navy | `#cuna` | **La cuña diferenciadora**, con luces de fondo en parallax |
| II | Oportunidades | `#oportunidades` | Los tres niveles de transferencia (ONU/OMT) |
| III | Competencia | `#competencia` | Directos, especialistas, indirectos, sede única y lectura estratégica |
| ◆ | Quiebre navy | — | **El punto de partida**: la cartera en cifras animadas |
| IV | Estrategia | `#estrategia` | Terreno, foso, modelo comercial, habilitadores, economía, fases, métricas y riesgos |
| ◆ | Quiebre navy | — | **El cierre en una frase** |
| V | Sistema visual | `#visual` | Paleta, tipografía, logotipo, movimiento y guía sí/no |
| — | Footer | — | Logo sobre disco blanco, nombre y línea meta |
 
### La sección de identidad: las cinco preguntas
 
La Parte I sigue la estructura definida en las notas del proyecto:
 
1. **¿Qué hacemos?**
2. **¿Cómo lo hacemos?** → incluye los valores
3. **¿Por qué lo hacemos?** → problema que resolvemos (tres golpes y causas) → objetivo → nuestra solución
4. **¿Para qué lo hacemos?** → misión y visión
5. **¿A quién nos dirigimos?** → el cliente y el comité de compra (decisor técnico, comercial y económico)
---
 
## 3. Sistema de superficies (lienzo blanco)
 
El documento usa **blanco `#FFFFFF` como lienzo base**, con dos planos de piezas encima:
 
| Plano | Fondo | Borde | Se usa en |
|---|---|---|---|
| Superficie teal | `#D5F0ED` | Teal fino `1px` | Tarjetas de contenido y citas (objetivo, misión, visión, cuña en claro) |
| Blanco definido | `#FFFFFF` | Teal `1px` más marcado | Tarjetas de nivel, tabla de riesgos, muestras de paleta, círculos de fase, fichas de valores |
| Navy | `#002B5B` | — | Quiebres narrativos (cuña, cifras, cierre) y footer |
 
**Detalles de acento:**
 
- Las **tarjetas de nivel** conservan su franja de color de 5 px en el costado izquierdo: teal (Nivel 1), teal claro (Nivel 2) y oro (Nivel 3).
- Las **etiquetas** (Profundizar Posadas, Diversificar, Mantenimiento, Compras, Dirección, Primero) llevan fondo dorado atenuado (`oro al 16%`) con borde dorado.
- Las **citas en secciones navy** llevan barra dorada de 4 px al lado izquierdo.
- Los **círculos de las fases** (1 · 2 · 3) son blancos con aro dorado.
---
 
## 4. Paleta y tipografía
 
**Paleta (HEX):** `#159895` teal · `#57C5B6` teal claro · `#FFFFFF` blanco (lienzo) · `#D5F0ED` superficie · `#1A5F7A` navy medio · `#002B5B` navy · `#AD9551` oro
 
**Regla mental:** teal y oro seducen · navy comunica · blanco respira.
 
**Tipografías:** Great Vibes (solo hero, nombre de marca) · Playfair Display 600–700 (titulares y subtítulos) · Inter 400/500/600 (cuerpo y datos, con `tabular-nums` en toda cifra).
 
---
 
## 5. Movimiento y efectos
 
El movimiento traduce el concepto rector —**flujo continuo**— y replica los efectos del archivo `RTB_sistema_marca.html`:
 
- **Scroll suave con inercia** (Lenis v1.1.13, `lerp: 0.085`), con anclas suaves desde la navegación y degradación a scroll nativo si la librería no carga o si el sistema pide movimiento reducido.
- **Barra de progreso** superior con degradado teal → teal claro → oro.
- **Barra de navegación viva:** transparente sobre el hero; al pasar los 40 px de scroll transiciona (0.5 s) a blanco con desenfoque, sombra fina y logo que encoge de 48 px a 40 px.
- **Hero:** resplandor radial teal amplio (elipse 130% × 85%) difuminándose hacia el blanco; logo con flote sutil; línea ondulada dorada que se dibuja sola al cargar.
- **Olas de continuidad** al pie del hero: dos capas SVG con curvas anchas (periodo 720), la primera a 16 s y la segunda en dirección contraria a 26 s. Banda de 230 px (210 px en móvil) que envuelve la línea meta.
- **Luces de fondo en parallax** en las tres secciones navy: cuatro orbes `radial-gradient` (teal claro, teal, oro) en dos capas con velocidades 0.18 y 0.36, movidas por el scroll.
- **Cascada de la cuña:** antetítulo, título, línea dorada, cita y párrafo aparecen escalonados al entrar en vista, con malla de seguridad a los 3 segundos.
- **Reveladores en cascada** en todas las secciones y **contadores animados** con cifras tabulares en "El punto de partida" (153 propiedades · 129 activas · 78% Posadas · 53% foráneo · ~32% margen · 24 dormidas).
- **Micro-interacciones:** tarjetas que suben al hover, subrayados teal que crecen en la navegación, fichas de valores que se llenan de teal.
---
 
## 6. Accesibilidad y robustez
 
- `prefers-reduced-motion` desactiva flote, olas, parallax, cascadas y Lenis, sin ocultar contenido.
- **Fallback sin JavaScript:** la clase `no-js` garantiza que todo el contenido sea visible aunque los scripts no corran.
- Los elementos decorativos (olas, luces, divisores) llevan `aria-hidden="true"`; el logo lleva `role="img"` con etiqueta descriptiva.
- El texto de lectura vive siempre en navy (`#002B5B` / `#1A5F7A`); teal claro y oro se reservan para bloques, etiquetas y remates, nunca para texto pequeño.
- La tabla de riesgos es desplazable horizontalmente en pantallas angostas.
---
 
## 7. Logotipo
 
El logotipo oficial (monograma RTB con llave y onda dorada, texto circular) está incrustado como **PNG transparente en base64**, procesado desde el original JPEG con remoción de fondo blanco. Se usa en tres tamaños: hero (grande, con flote), navegación (48→40 px) y footer (mediano, sobre disco blanco sólido para legibilidad en navy).
 
**Pendientes del logotipo:** conseguir el archivo vectorial (SVG/AI) para escalado sin pérdida y para animar la llave y la onda por separado; crear la variante compacta (solo monograma) para navegación y favicons.
 
---
 
## 8. Mantenimiento
 
- **Colores y superficies** están centralizados en variables CSS (`:root`): cambiar `--superficie` o `--fondo` recalibra todas las piezas de un plano.
- **Contenido:** cada sección es un bloque `<section>` independiente con su ancla; el contenido editorial proviene de los cuatro documentos fuente y debe mantenerse sincronizado con ellos usando la terminología establecida (*industria turística, asesor-proveedor, cuña diferenciadora, Nivel 1/Nivel 2, cero riesgo de refaccionamiento, sus clientes*).
- **Efectos:** las luces navy se insertan como bloques `env-layer` reutilizables; las velocidades de parallax viven en `data-speed`.
- **Peso del archivo:** ~190 KB, dominado por el logo en base64 (embebido una sola vez como clase CSS de fondo).
---
 
*Referencia del documento maestro · Refacciones Tomás Badillo, S.A. de C.V. · Proyecto de reestructuración · V1.0 · 2026*