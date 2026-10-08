## Objetivo del paso

Una Web API es, en esencia, un programa que **entiende peticiones HTTP y responde con HTTP**. Si no dominas el vocabulario de HTTP (verbos, cabeceras, códigos de estado), el código de ASP.NET Core parecerá magia; si lo dominas, cada atributo y cada método tendrá sentido.

En este paso no escribirás código C#. Vas a:

1. Aprender cómo es una petición y una respuesta HTTP por dentro.
2. Entender qué significa cada verbo y cada código de estado que usaremos.
3. **Diseñar los endpoints de Bookshelf** justificando cada decisión.
4. Practicar con el archivo `.http` observando respuestas reales.

## Anatomía de una petición y una respuesta

HTTP es un protocolo de **petición y respuesta** basado en texto. El cliente envía una petición; el servidor responde. Nada más.

:::concept Una petición HTTP
Una petición tiene cuatro partes:

```
GET /api/books?genre=Fantasy HTTP/1.1
Host: localhost:5125
Accept: application/json

(cuerpo opcional)
```

| Parte | Ejemplo | Para qué sirve |
| --- | --- | --- |
| **Método (verbo)** | `GET` | La acción que quiere hacer el cliente. |
| **URL (ruta + consulta)** | `/api/books?genre=Fantasy` | Sobre qué recurso. La parte tras `?` es la *query string*. |
| **Cabeceras** | `Accept: application/json` | Metadatos: qué formato espero, quién soy, qué formato envío… |
| **Cuerpo (body)** | `{ "title": "Dune" }` | Los datos que se envían (en `POST`, `PUT`, `PATCH`). Las peticiones `GET` normalmente no llevan. |
:::

:::concept Una respuesta HTTP
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Server: Kestrel

[{"id":2,"title":"The Hobbit", ...}]
```

| Parte | Ejemplo | Para qué sirve |
| --- | --- | --- |
| **Línea de estado** | `200 OK` | Un **código numérico** y su texto: qué resultado tuvo la petición. |
| **Cabeceras** | `Content-Type: application/json` | Metadatos de la respuesta: formato del cuerpo, servidor, etc. |
| **Cuerpo** | `[{"id":2, ...}]` | Los datos devueltos (aquí, JSON). Puede estar vacío. |
:::

La cabecera `Content-Type` es la que dice **cómo interpretar el cuerpo**. Cuando envíes datos a tu API, también deberás indicar `Content-Type: application/json`, o la API no sabrá que le mandas JSON.

## JSON en un minuto

**JSON** es el formato de texto más usado para intercambiar datos en APIs. Tiene seis tipos de valor: objeto, arreglo, texto, número, booleano y `null`.

```json
{
  "id": 4,
  "title": "The Hobbit",
  "author": "J.R.R. Tolkien",
  "year": 1937,
  "isRead": true,
  "rating": null,
  "tags": ["fantasy", "classic"]
}
```

- `{ }` es un **objeto**: pares `"nombre": valor`. Los nombres van siempre entre comillas dobles.
- `[ ]` es un **arreglo**: una lista de valores.
- Los textos van entre comillas dobles; los números y los booleanos (`true`/`false`), no.
- `null` representa "sin valor".

:::tip JSON y C#
ASP.NET Core convierte automáticamente tus objetos C# a JSON y al revés (esto se llama *serialización*). Por convención, usa nombres en **camelCase**: la propiedad C# `IsRead` viaja como `"isRead"`. Lo verás en acción en el paso 7.
:::

## Los verbos HTTP

Cada verbo expresa una **intención**. Dos propiedades importan al diseñar una API:

- **Segura (*safe*):** no modifica nada en el servidor. Puedes repetirla sin consecuencias.
- **Idempotente:** repetirla N veces deja el sistema en el **mismo estado** que repetirla una vez. (Ejemplo: borrar el libro 3 dos veces deja el mismo resultado: el libro 3 no existe.)

| Verbo | Intención | ¿Segura? | ¿Idempotente? | Ejemplo en Bookshelf |
| --- | --- | --- | --- | --- |
| `GET` | Leer un recurso o una colección | Sí | Sí | `GET /api/books/3` |
| `POST` | Crear un recurso nuevo | No | **No** (cada llamada crea otro) | `POST /api/books` |
| `PUT` | **Reemplazar** un recurso por completo | No | Sí | `PUT /api/books/3` |
| `PATCH` | Modificar **parte** de un recurso | No | Depende del diseño | `PATCH /api/books/3/read` |
| `DELETE` | Eliminar un recurso | No | Sí | `DELETE /api/books/3` |

:::why ¿Por qué importa la idempotencia?
Porque las redes fallan. Si un cliente envía un `PUT` y no recibe respuesta, puede **reintentar sin miedo**: el resultado será el mismo. Con un `POST` no puede: si el primer intento sí llegó, el reintento crearía un duplicado. Elegir bien el verbo hace tu API más fácil de usar de forma robusta.
:::

## Códigos de estado

El código de estado es lo primero que mira un cliente. Se agrupan por centenas:

| Rango | Significado |
| --- | --- |
| `2xx` | Éxito. |
| `3xx` | Redirección. |
| `4xx` | **Error del cliente**: la petición está mal o pide algo inexistente. |
| `5xx` | **Error del servidor**: la petición era válida, pero algo falló dentro de la API. |

Estos son los códigos que usaremos en Bookshelf y cuándo corresponde cada uno:

| Código | Nombre | Cuándo lo devolvemos |
| --- | --- | --- |
| `200` | OK | Una lectura o una operación fue bien y devolvemos datos (`GET`, `PATCH`). |
| `201` | Created | Un `POST` creó un recurso. Va acompañado de la cabecera `Location` con la URL del recurso nuevo. |
| `204` | No Content | La operación fue bien y **no hay nada que devolver** (`PUT`, `DELETE`). |
| `400` | Bad Request | Los datos enviados son inválidos (título vacío, año imposible, JSON mal formado). |
| `404` | Not Found | El recurso solicitado no existe (por ejemplo, el libro con `id` 999). |
| `500` | Internal Server Error | Un fallo inesperado de la API (un bug, el archivo no se puede leer). |

:::warning 400 frente a 404 frente a 500
Un error muy frecuente es devolver el código equivocado. Pregúntate **quién se equivocó**:

- El cliente envió datos incorrectos: **`400`**.
- El cliente pidió algo que no existe: **`404`**.
- El cliente hizo todo bien pero el servidor falló: **`500`**.

Un cliente bien escrito reacciona de forma distinta a cada uno (corrige el formulario, muestra "no encontrado", reintenta más tarde).
:::

## Diseño REST: recursos, no acciones

:::concept Recursos y URLs
En una API REST, la URL identifica un **recurso** (un sustantivo) y el verbo HTTP dice qué hacer con él. La URL no debe contener verbos.

| Mal diseño (acciones en la URL) | Buen diseño (recursos + verbos) |
| --- | --- |
| `GET /getAllBooks` | `GET /api/books` |
| `GET /getBook?id=3` | `GET /api/books/3` |
| `POST /createBook` | `POST /api/books` |
| `POST /deleteBook?id=3` | `DELETE /api/books/3` |

Las reglas prácticas:

- Usa **sustantivos en plural** para las colecciones: `/api/books`, no `/api/book`.
- Un **identificador en la ruta** señala un elemento concreto: `/api/books/3`.
- Los **filtros** van en la query string, porque no identifican un recurso: refinan una colección (`/api/books?genre=Fantasy`).
- El prefijo `/api` separa la API de otras posibles rutas del sitio.
:::

:::why ¿Por qué /api/books/{id} y no /getBook?id=3?
Porque con recursos y verbos **no tienes que inventar ni memorizar nombres**. Quien conoce la convención adivina cómo borrar un libro sin leer documentación: `DELETE` sobre su URL. Además, el verbo ya comunica seguridad e idempotencia (por ejemplo, las herramientas pueden guardar en caché un `GET`, pero no un `POST`). Una URL como `/getBook` mezcla en el nombre algo que HTTP ya expresa con el verbo.
:::

### Los endpoints de Bookshelf

Aplicamos todo lo anterior al dominio de la biblioteca. El recurso es **book** y estos son los endpoints que construiremos:

| # | Método y ruta | Qué hace | Éxito | Errores |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/books?genre=&isRead=` | Lista libros; permite filtrar por género y por estado de lectura. | `200` + lista | — |
| 2 | `GET /api/books/{id}` | Devuelve un libro. | `200` + libro | `404` |
| 3 | `POST /api/books` | Crea un libro. | `201` + libro + `Location` | `400` |
| 4 | `PUT /api/books/{id}` | Reemplaza todos los datos del libro. | `204` | `400`, `404` |
| 5 | `DELETE /api/books/{id}` | Elimina el libro. | `204` | `404` |
| 6 | `PATCH /api/books/{id}/read` | Marca el libro como leído y guarda una valoración. | `200` + libro | `400`, `404` |

Justifiquemos las decisiones menos obvias:

- **El `GET` de la lista nunca devuelve `404`.** Una colección vacía sigue siendo una respuesta válida: `200` con `[]`. Un `404` significaría "esta URL no existe", no "no hay resultados".
- **`POST` devuelve `201` y no `200`.** `201` comunica que se **creó** algo, y la cabecera `Location` (por ejemplo, `/api/Books/9`) le dice al cliente dónde encontrarlo. Además devolvemos el libro creado, porque el servidor le asigna el `id`.
- **`PUT` y `DELETE` devuelven `204`.** El cliente ya conoce el estado final (lo que envió, o que ya no existe), así que no hace falta cuerpo.
- **`PUT` exige todos los campos; `PATCH` solo algunos.** `PUT` significa "reemplaza el recurso entero por esto". Para un cambio pequeño como marcar un libro como leído, obligar al cliente a reenviar los seis campos es incómodo y peligroso: podría pisar datos que otro cliente acaba de modificar.
- **¿Por qué `PATCH /api/books/{id}/read` y no `PATCH /api/books/{id}`?** Marcar un libro como leído es una **operación con significado propio** (y con su propia regla: la valoración es de 1 a 5). Darle una ruta explícita hace la intención evidente y permite validar solo lo que importa. Es una decisión pragmática: existen diseños más genéricos (como el estándar JSON Patch), pero para una acción concreta una ruta clara es más fácil de usar y de entender.

## Practica con el archivo .http

Vamos a observar HTTP en acción con tu API. Todavía no tienes endpoints propios, pero el documento OpenAPI y las rutas que no existen bastan para ver peticiones, cabeceras y códigos de estado reales.

:::vs Preparar las peticiones
1. Ejecuta la API con el perfil **http** y <kbd>Ctrl</kbd> + <kbd>F5</kbd> (como en el paso 2).
2. Abre `Bookshelf.Api.http`.
3. Deja la variable de la primera línea con **tu** puerto y añade debajo estas tres peticiones:

```http title="Bookshelf.Api.http"
@Bookshelf.Api_HostAddress = http://localhost:5125

### OpenAPI document (200)
GET {{Bookshelf.Api_HostAddress}}/openapi/v1.json
Accept: application/json

### A route that does not exist (404)
GET {{Bookshelf.Api_HostAddress}}/does-not-exist

### Wrong verb for an existing route (405)
POST {{Bookshelf.Api_HostAddress}}/openapi/v1.json
```

4. Envía cada petición con **Send request**, una por una, y examina la respuesta. El panel de respuesta permite ver las cabeceras y el cuerpo.
:::

:::checkpoint Qué debes observar
**1. `GET /openapi/v1.json`** (`200 OK`):

```
HTTP/1.1 200 OK
Content-Type: application/json;charset=utf-8
Date: Thu, 08 Oct 2026 17:53:45 GMT
Server: Kestrel
Transfer-Encoding: chunked
```

El cuerpo es el documento OpenAPI. Fíjate en `Content-Type` y en `Server: Kestrel`.

**2. `GET /does-not-exist`** (`404 Not Found`):

```
HTTP/1.1 404 Not Found
Content-Length: 0
Date: Thu, 08 Oct 2026 17:53:45 GMT
Server: Kestrel
```

El cuerpo está vacío (`Content-Length: 0`). Ningún endpoint coincide con esa ruta.

**3. `POST /openapi/v1.json`** (`405 Method Not Allowed`):

```
HTTP/1.1 405 Method Not Allowed
Content-Length: 0
Date: Thu, 08 Oct 2026 17:53:45 GMT
Server: Kestrel
Allow: GET
```

La ruta **sí** existe, pero solo acepta `GET`. La cabecera `Allow: GET` te lo dice. Esto demuestra que en ASP.NET Core una ruta se define por la combinación de **ruta y verbo**.

(La fecha y la hora serán las de tu equipo.)
:::

Ten en cuenta este patrón: `404` = "esa URL no existe", `405` = "esa URL existe, pero no con ese verbo". Cuando tus endpoints existan, recibirás `404` también cuando pidas un libro con un `id` que no existe, pero por una razón distinta: el endpoint existe y es **tu código** quien decide responder `404`.

:::troubleshooting Errores comunes
- **Todas las peticiones fallan por no poder conectar:** la API no está en ejecución o el puerto de `@Bookshelf.Api_HostAddress` no coincide con el de tu consola.
- **`/openapi/v1.json` devuelve `404`:** estás ejecutando en un entorno distinto de `Development`. El documento OpenAPI solo se publica en desarrollo (lo verás en el paso 5). Comprueba que `ASPNETCORE_ENVIRONMENT` es `Development` en tu perfil.
- **El editor no muestra el enlace `Send request`:** la petición debe estar separada de la anterior por una línea que empiece por `###`, y el archivo debe tener la extensión `.http`.
:::

::::challenge Diseña los endpoints de un recurso nuevo
Imagina que Bookshelf crece y necesitas gestionar **autores** como un recurso propio (cada autor tiene un `id`, un nombre y un país). Aplicando lo que has aprendido en este paso, diseña los endpoints de `authors`:

1. Una tabla con **método y ruta**, qué hace, y el **código de éxito** y los **códigos de error** de cada uno.
2. Debe poder listar autores, ver uno, crear, reemplazar, borrar, y además **listar los libros de un autor**.

No hace falta escribir código: solo diseñar. Escribe tu tabla antes de abrir las pistas.

:::hint
Empieza por el recurso principal en plural: `/api/authors`. Los cinco primeros endpoints son los mismos que los de `books`, cambiando solo el recurso.
:::

:::hint
Para "los libros de un autor", piensa en la relación: los libros **pertenecen** a un autor. En REST se expresa anidando el recurso hijo bajo el padre: `/api/authors/{id}/...`. ¿Qué verbo usarías para leer?
:::

:::hint
Piensa en dos casos distintos: si el autor **no existe**, ¿qué código corresponde? Y si el autor existe pero **no tiene libros**, ¿cuál? Recuerda lo que decidimos para la lista de `books`: una colección vacía no es un error.
:::

:::solution
| Método y ruta | Qué hace | Éxito | Errores |
| --- | --- | --- | --- |
| `GET /api/authors` | Lista los autores. | `200` + lista | — |
| `GET /api/authors/{id}` | Devuelve un autor. | `200` + autor | `404` |
| `POST /api/authors` | Crea un autor. | `201` + autor + `Location` | `400` |
| `PUT /api/authors/{id}` | Reemplaza todos los datos del autor. | `204` | `400`, `404` |
| `DELETE /api/authors/{id}` | Elimina el autor. | `204` | `404` |
| `GET /api/authors/{id}/books` | Lista los libros de ese autor. | `200` + lista (puede ser `[]`) | `404` si el autor no existe |

Por qué es así:

- Es el mismo patrón que `books`: sustantivos en plural, `{id}` para un elemento concreto y el verbo indica la acción.
- Los libros de un autor son un **subrecurso**: se anidan bajo el autor (`/api/authors/{id}/books`) y se leen con `GET`.
- Una decisión adicional que no tiene una única respuesta correcta: ¿qué ocurre al borrar un autor que aún tiene libros? Una opción común es responder `409 Conflict` ("la operación choca con el estado actual del recurso") para evitar dejar libros huérfanos.
:::
::::

:::recap
- Una **petición** HTTP tiene método, URL, cabeceras y cuerpo opcional; una **respuesta** tiene código de estado, cabeceras y cuerpo.
- Los **verbos** expresan la intención: `GET` lee, `POST` crea, `PUT` reemplaza, `PATCH` modifica parcialmente, `DELETE` elimina. `GET`, `PUT` y `DELETE` son idempotentes; `POST` no lo es.
- Usamos `200`, `201`, `204`, `400`, `404` y `500`, y elegimos según **quién se equivocó**.
- En REST las URL son **sustantivos** (`/api/books/3`) y el verbo dice la acción; los filtros van en la query string.
- Diseñaste los seis endpoints de Bookshelf y viste con el archivo `.http` los códigos `200`, `404` y `405` reales.

En el siguiente paso entrarás de lleno en el código: entenderás cómo arranca una aplicación ASP.NET Core, línea a línea, y qué es el *host*.
:::
