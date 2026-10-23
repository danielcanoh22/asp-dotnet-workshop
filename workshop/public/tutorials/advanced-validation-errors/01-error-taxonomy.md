## Objetivo del paso

Antes de tocar código conviene ponerle nombre a lo que vas a tratar. "Error" es una palabra demasiado amplia: un título vacío, una tarea que no existe y una base de datos caída son problemas muy distintos, los detecta código distinto y el cliente debe reaccionar de forma distinta a cada uno.

En este paso, sin escribir código, vas a:

1. Distinguir cinco tipos de error: **validación**, **regla de negocio**, **recurso inexistente**, **conflicto** y **error inesperado**.
2. Saber **quién detecta** cada uno dentro de tu API.
3. Elegir el **código de estado** adecuado: `400`, `404`, `409`, `422` y `500` (y conocer de oídas `412` y `499`).
4. Repasar **`ProblemDetails`** (RFC 9457), el formato que usarán todas tus respuestas de error.

## Cinco tipos de error

Piensa en una petición `POST /api/projects/1/tasks` de Task Tracker. Puede fallar de cinco maneras:

| Tipo | Ejemplo en Task Tracker | ¿De quién es la culpa? | ¿Puede arreglarlo el cliente? |
| --- | --- | --- | --- |
| **Validación** | El título viene vacío o la fecha límite ya pasó. | Del cliente: la petición está mal formada. | Sí: corrige los datos y repite. |
| **Regla de negocio** | Quieres borrar un proyecto que tiene tareas abiertas. | De nadie: la petición es correcta, pero el **estado actual** no lo permite. | Sí, cambiando el estado primero (completar las tareas) o pidiéndolo de otra forma. |
| **Recurso inexistente** | El proyecto `1` no existe. | Del cliente, o de alguien que lo borró antes. | Solo si tenía el `id` equivocado. |
| **Conflicto** | Ya existe una etiqueta `backend`, u otra persona modificó la tarea mientras la editabas. | De la concurrencia: dos operaciones chocan. | Sí: vuelve a leer y decide. |
| **Error inesperado** | La base de datos no responde, o hay un `NullReferenceException` en tu código. | **Del servidor.** | No. Lo único que puede hacer es reintentar más tarde o avisar. |

:::concept Errores esperados frente a inesperados
Los cuatro primeros son **errores esperados**: forman parte del contrato de tu API, sabes que ocurrirán y diseñas una respuesta para cada uno. El último es un **error inesperado**: un fallo que nadie previó. La diferencia importa mucho:

- Un error esperado se responde con un **mensaje útil para el cliente** ("El título no puede estar vacío") y **no** es un problema que haya que investigar.
- Un error inesperado se responde con un mensaje **genérico** (los detalles internos ayudan a un atacante) y **sí** hay que registrarlo en el log para investigarlo.

Un `500` por un título vacío es un error de diseño: confunde al cliente y llena tu log de falsas alarmas.
:::

## Quién detecta cada error

Cada tipo de error se detecta en un punto distinto del camino de una petición. Lo verás en el paso 2 con la API real:

| Momento | Quién | Qué detecta | Respuesta |
| --- | --- | --- | --- |
| 1. **Binding** | Minimal APIs, al leer la petición | JSON mal formado, un `status` que no existe en el enum, un `id` que no es número. | `400` |
| 2. **Validación** | El validador, antes del handler | Campos obligatorios, longitudes, formatos, fechas. | `400` |
| 3. **Handler** | Tu código, con datos de la base de datos | Recursos inexistentes y reglas de negocio. | `404`, `409` |
| 4. **Base de datos** | SQLite, al ejecutar el SQL | Índices únicos, claves foráneas, conflictos de concurrencia. | `409` (cuando lo traduces) |
| 5. **Cualquier otro sitio** | Nadie lo esperaba | Todo lo demás. | `500` |

Fíjate en el orden: cuanto antes se detecta un error, más barato es. Un `400` de validación no toca la base de datos; un conflicto de la base de datos ya ha hecho todo el trabajo y lo descarta.

## Los códigos de estado

| Código | Nombre | Cuándo lo usarás |
| --- | --- | --- |
| `400` | Bad Request | La petición no se puede leer o no cumple las reglas de validación. |
| `404` | Not Found | El recurso de la ruta no existe. |
| `409` | Conflict | La petición es válida, pero choca con el **estado actual** del recurso: un nombre duplicado, una regla de negocio, una versión antigua. |
| `422` | Unprocessable Content | La petición se entiende y está bien formada, pero su contenido no se puede procesar. Algunas APIs lo usan para la validación o para las reglas de negocio. |
| `500` | Internal Server Error | Algo falló en el servidor. El cliente no tiene la culpa. |

:::why ¿Por qué 400 y no 422 para la validación?
Las dos opciones son defendibles y encontrarás APIs de los dos tipos. Usamos `400` porque es lo que hace ASP.NET Core por defecto (`ValidationProblem` responde `400`), porque es lo que ya devolvía tu API en el tutorial 2 y porque el `400` cubre bien la idea de "corrige tu petición". Lo importante es **elegir una convención y mantenerla** en toda la API. En el paso 8 volverás a este debate con las reglas de negocio, donde la elección entre `409` y `422` es más interesante.
:::

Dos códigos más que conviene reconocer, aunque no los devolverás en este tutorial:

| Código | Qué significa | Por qué no lo usaremos |
| --- | --- | --- |
| `412` Precondition Failed | El cliente envió una condición (por ejemplo, la cabecera `If-Match` con una versión) y no se cumple. | Es la alternativa "HTTP nativa" a la concurrencia optimista que harás en el paso 11. Allí verás cuándo conviene. |
| `499` Client Closed Request | **No es estándar.** Lo usan algunos servidores proxy (como nginx) para anotar en sus logs que el cliente cerró la conexión antes de recibir la respuesta. | Nadie recibe ese código: el cliente ya se fue. En el tutorial 2 ya resolviste el caso de forma más útil, pasando el `CancellationToken` a EF Core. |

## ProblemDetails: un formato para todos los errores

Ya conoces `ProblemDetails` de los tutoriales anteriores. Es un formato estándar para describir errores en JSON, definido en la **RFC 9457** (que sustituye a la RFC 7807, la que verás citada en artículos antiguos).

:::concept Los campos de ProblemDetails
| Campo | Qué contiene | Ejemplo |
| --- | --- | --- |
| `type` | Una URI que identifica el **tipo** de problema. ASP.NET Core pone por defecto un enlace a la sección del código de estado en la RFC 9110. | `"https://tools.ietf.org/html/rfc9110#section-15.5.10"` |
| `title` | Un resumen corto, igual para todas las apariciones de ese tipo de problema. | `"Tag already exists"` |
| `status` | El código de estado HTTP, repetido en el cuerpo. | `409` |
| `detail` | La explicación de **esta** aparición concreta. | `"A tag named 'backend' already exists."` |
| `instance` | Qué petición concreta produjo el problema. | `"POST /api/tags"` (lo añadirás en el paso 7) |
| Extensiones | Cualquier campo adicional. La validación añade `errors`; tú añadirás `code`. | `"code": "tag.already_exists"` |
:::

Hay una extensión que ya aparece en todas tus respuestas de error sin que hayas escrito nada: **`traceId`**. La añade .NET cuando registras `AddProblemDetails()`:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "traceId": "00-10657377ec051306e2703c61738e439f-ce2ec13e22870b23-00"
}
```

El `traceId` identifica la petición en los logs y en las herramientas de trazas (sigue el formato estándar W3C *Trace Context*). Si un usuario te envía una respuesta de error, ese valor te lleva directamente a lo que pasó en el servidor. No tendrás que programarlo; solo saber que existe y para qué sirve.

:::why ¿Por qué un formato único?
Un cliente (una aplicación web, una app móvil, otro servicio) tiene que reaccionar a los errores. Si cada endpoint los devuelve con una forma distinta (`{ "error": "..." }` aquí, `{ "message": "..." }` allá, texto plano en otro sitio), el cliente necesita un caso especial para cada uno. Con `ProblemDetails`, el cliente escribe **un** tratamiento de errores: lee `status` y `title` siempre, `errors` si es una validación y, desde el paso 7, `code` para decidir qué hacer sin comparar textos.
:::

:::checkpoint Antes de seguir
Clasifica estas situaciones de Task Tracker. Para cada una, di el **tipo de error**, **quién lo detecta** y el **código de estado**. Las respuestas están justo debajo.

1. `POST /api/tags` con `{ "name": "has space" }`.
2. `GET /api/tasks/999`.
3. `DELETE /api/projects/1` cuando el proyecto tiene tareas sin completar.
4. `POST /api/projects` con el cuerpo `{ "name":` (el JSON se corta).
5. Dos personas crean a la vez la etiqueta `docs`; la segunda llega a la base de datos cuando la primera ya la guardó.
6. Se borra por error el archivo `tasktracker.db` y la siguiente consulta lanza una excepción.

Respuestas:

1. **Validación**, la detecta el validador, `400`.
2. **Recurso inexistente**, el handler, `404`.
3. **Regla de negocio**, el handler, `409` (lo implementarás en el paso 8).
4. **Petición ilegible**, el binding de Minimal APIs, `400`. Es un error del cliente, pero ni siquiera llega a la validación.
5. **Conflicto**, la base de datos (el índice único), `409` cuando lo traduzcas en el paso 10. Hoy sería un `500`.
6. **Error inesperado**, nadie lo esperaba, `500`. Hay que registrarlo en el log.
:::

:::troubleshooting Errores comunes
- **Responder `200 OK` con `{ "success": false }`:** el código de estado es la primera información que lee un cliente (y cualquier proxy o herramienta de monitorización). Si un error responde `200`, todos creerán que la petición funcionó.
- **Usar `500` para errores del cliente:** un `500` dice "el servidor falló". Si la causa era un dato incorrecto, el cliente no sabe que debe corregirlo y tus alertas se disparan por nada.
- **Enviar el mensaje de la excepción al cliente en producción:** un `detail` con `SQLite Error 19: 'UNIQUE constraint failed: Tags.Name'` revela nombres de tablas y columnas. En el paso 9 verás cómo mostrar detalles solo en `Development`.
- **Mezclar formatos de error:** si algunos endpoints devuelven `ProblemDetails` y otros un objeto propio, el cliente necesita dos tratamientos. Desde el paso 7, todos los errores tendrán la misma forma.
:::

:::recap
- Hay cinco tipos de error: **validación**, **regla de negocio**, **recurso inexistente**, **conflicto** y **error inesperado**. Los cuatro primeros son parte del contrato; el último es un fallo.
- Cada tipo se detecta en un punto distinto: binding, validador, handler, base de datos o "en cualquier sitio".
- Códigos: `400` (petición incorrecta), `404` (no existe), `409` (choca con el estado actual), `422` (alternativa a `400`/`409` que usan algunas APIs), `500` (fallo del servidor). `412` y `499` existen, pero no los usarás aquí.
- **`ProblemDetails`** (RFC 9457) da a todos los errores la misma forma: `type`, `title`, `status`, `detail`, `instance` y extensiones como `errors`, `traceId` y `code`.
- `traceId` ya lo añade .NET: conecta una respuesta de error con sus entradas en el log.

En el siguiente paso prepararás el proyecto del tutorial 2 y provocarás cada uno de estos errores para ver cómo responde hoy tu API.
:::
