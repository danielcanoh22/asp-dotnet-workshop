## Objetivo del paso

Antes de mejorar el manejo de errores necesitas saber **cómo responde hoy** tu API cuando algo sale mal. En este paso harás una pequeña auditoría: provocarás a propósito cada tipo de error del paso 1 y anotarás qué devuelve la API. Vas a:

1. Preparar el proyecto del tutorial 2 (el tuyo o la solución de referencia) y comprobar que funciona.
2. Crear **`errors.http`**, un archivo de peticiones dedicado solo a los errores.
3. Mover a ese archivo las peticiones de validación que tenías en `TaskTracker.Api.http`.
4. Ejecutar la auditoría y encontrar **cinco puntos débiles** que arreglarás en el resto del tutorial.

## Prepara el proyecto

Puedes partir de tu propio proyecto del tutorial 2 o de la solución de referencia. Las dos opciones llegan al mismo sitio.

:::vs Abrir el proyecto del tutorial 2
1. Copia la carpeta completa de la solución a una ubicación nueva, por ejemplo `C:\Users\TuUsuario\source\repos\TaskTracker-errors`. Si usas la solución de referencia, la carpeta es `reference-solutions/02-task-tracker-api/` del repositorio del taller. Trabajar sobre una copia te permite comparar con el original si algo se rompe.
2. Abre **Visual Studio 2026** y elige **Open a project or solution** (*Abrir un proyecto o una solución*). Selecciona el archivo **`TaskTracker.slnx`** de la copia.
3. Compila con <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>. Debe terminar sin errores ni advertencias.
:::

Ahora necesitas una base de datos con los **datos de ejemplo** recién sembrados, porque todas las peticiones de este tutorial asumen esos `id`:

- **Si usas la solución de referencia**, no trae base de datos (el `.gitignore` excluye `tasktracker.db`). Al ejecutar la API en `Development`, `MigrateAsync` la crea y la siembra sola, como aprendiste en el paso 13 del tutorial 2.
- **Si usas tu propio proyecto**, tu base de datos tiene los cambios que hiciste mientras practicabas. Empieza de cero: con la API detenida, ejecuta en la **Package Manager Console** (**Tools** > **NuGet Package Manager** > **Package Manager Console**) `Drop-Database` (confirma con `Y`) y después `Update-Database`.

Ejecuta la API con <kbd>Ctrl</kbd> + <kbd>F5</kbd> (perfil **http**) y envía `GET /api/projects` desde `TaskTracker.Api.http`: deben aparecer los dos proyectos sembrados, *Mobile app launch* y *Website redesign*.

:::tip Tu puerto puede ser otro
Los ejemplos usan `http://localhost:5283`, el puerto de la solución de referencia. Si tu proyecto usa otro, consérvalo en la primera línea de cada archivo `.http` (`@TaskTracker.Api_HostAddress = ...`).
:::

## Un archivo solo para errores

`TaskTracker.Api.http` recorre la API por el **camino feliz**: crear, consultar, modificar, borrar. Al final tiene dos peticiones de validación que añadiste en el tutorial 2. A medida que la API aprenda a responder errores, esa sección crecería hasta ocupar más que el resto del archivo.

:::concept Un .http por propósito
Un archivo `.http` es documentación ejecutable: cualquiera que abra el proyecto puede leerlo y enviar sus peticiones. Separar los archivos por propósito los hace más fáciles de leer:

| Archivo | Qué contiene | Cómo se usa |
| --- | --- | --- |
| `TaskTracker.Api.http` | El camino feliz, recurso por recurso. | Para probar que todo funciona. |
| `errors.http` | **Una petición por cada error** que puede devolver la API, agrupadas por código de estado. | Para comprobar que cada error responde lo que debe. Al final del tutorial será el catálogo completo de errores. |
:::

:::vs Crear errors.http
1. En Solution Explorer, haz clic derecho sobre el proyecto `TaskTracker.Api` > **Add** > **New Item…**
2. Busca la plantilla **HTTP File** y nómbrala **`errors.http`**. (Si en tu instalación no aparece esa plantilla, elige **Text File** y ponle el nombre `errors.http`; lo único que importa es la extensión.)
3. Reemplaza todo su contenido por el siguiente. Conserva **tu** puerto en la primera línea.
:::

```http title="errors.http"
@TaskTracker.Api_HostAddress = http://localhost:5283

# Every error the API can return, one request each.
# Run them in order on a freshly seeded database (Drop-Database + Update-Database).

### --- 400: validation (DataAnnotations) ---

POST {{TaskTracker.Api_HostAddress}}/api/projects
Content-Type: application/json

{
  "name": ""
}

###

POST {{TaskTracker.Api_HostAddress}}/api/tags
Content-Type: application/json

{
  "name": "not a valid tag!"
}

### --- 400: input the API cannot read ---

GET {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks?status=Unknown

###

POST {{TaskTracker.Api_HostAddress}}/api/projects
Content-Type: application/json

{ "name":

### --- 404: the resource does not exist ---

GET {{TaskTracker.Api_HostAddress}}/api/projects/999

### --- Rules the API does not enforce yet ---

# Today this creates a task that is already overdue: 201.
POST {{TaskTracker.Api_HostAddress}}/api/projects/1/tasks
Content-Type: application/json

{
  "title": "Born overdue",
  "dueDate": "2020-01-01"
}

###

# Today this deletes the project and all of its tasks: 204.
DELETE {{TaskTracker.Api_HostAddress}}/api/projects/1

### --- 409: conflicts ---

POST {{TaskTracker.Api_HostAddress}}/api/tags
Content-Type: application/json

{
  "name": "backend"
}
```

Cómo está organizado:

- **Las secciones siguen la taxonomía del paso 1**: validación, petición ilegible, recurso inexistente y conflictos. A medida que avances, las peticiones de la sección *Rules the API does not enforce yet* se moverán a la sección del código que les corresponde.
- **Las líneas que empiezan por `#`** son comentarios. Sirven para anotar qué esperas de cada petición.
- **La petición `{ "name":`** está cortada a propósito: es un JSON mal formado.
- **El orden importa.** `DELETE /api/projects/1` borra el proyecto 1 y sus tareas, así que va después de las peticiones que usan ese proyecto. Por eso el comentario de la cabecera pide ejecutarlas en orden sobre una base de datos recién sembrada.

Las dos peticiones de validación del tutorial 2 ya están en `errors.http` (el nombre vacío en la primera sección y `?status=Unknown` en la segunda). Quítalas de `TaskTracker.Api.http`:

:::vs Editar TaskTracker.Api.http
Abre `TaskTracker.Api.http`, ve al final y borra la sección completa `### --- Validation errors (expect 400) ---` (desde esa línea hasta el final del archivo). En su lugar escribe una sola línea, que deja una pista a quien lea el archivo.
:::

El final de `TaskTracker.Api.http` queda así:

```http title="TaskTracker.Api.http (final del archivo)"
###

DELETE {{TaskTracker.Api_HostAddress}}/api/tags/3

### Error cases live in errors.http
```

## La auditoría

Con la API en ejecución y la base de datos recién sembrada, abre `errors.http` y envía las peticiones **en orden**, una a una, con **Send request**. Anota el código de estado y el cuerpo de cada respuesta. Esto es lo que verás:

| Petición | Respuesta hoy | ¿Correcto? |
| --- | --- | --- |
| `POST /api/projects` con `"name": ""` | `400`, `errors` → `Name: ["The Name field is required."]` | Sí. |
| `POST /api/tags` con `"name": "not a valid tag!"` | `400`, `errors` → `Name: ["Use only letters, numbers and hyphens."]` | Sí. |
| `GET .../tasks?status=Unknown` | `400`, `"title": "Bad Request"`, sin más explicación. | A medias. |
| `POST /api/projects` con `{ "name":` | `400`, `"title": "Bad Request"`, sin más explicación. | A medias. |
| `GET /api/projects/999` | `404` con `ProblemDetails`. | Sí. |
| `POST .../tasks` con `"dueDate": "2020-01-01"` | **`201 Created`**: una tarea que nace vencida. | **No.** |
| `DELETE /api/projects/1` | **`204 No Content`**, y sus tareas desaparecen. | **No.** |
| `POST /api/tags` con `"name": "backend"` | `409`, `"title": "Tag already exists"`. | Sí, de momento. |

Lo que funciona viene del tutorial 2: `AddValidation()` y las DataAnnotations para la validación, `UseStatusCodePages` para el `404` y una comprobación en el handler para el `409`. Ahora, lo que no funciona.

### Punto débil 1: una tarea que nace vencida

La API acepta una fecha límite de 2020. Ninguna DataAnnotation dice "la fecha no puede estar en el pasado", porque esa regla depende de **qué día es hoy**, y un atributo no tiene forma sencilla de saberlo. Es el tema del paso 3.

### Punto débil 2: borrar un proyecto borra su trabajo en silencio

`DELETE /api/projects/1` responde `204` y, por la cascada que configuraste en el tutorial 2, se lleva por delante las tareas del proyecto, **incluidas las que estaban sin terminar**. Compruébalo: `GET /api/tasks/1` (una tarea del proyecto 1) responde ahora `404`.

Técnicamente no hay ningún error: la petición es válida y la API hizo lo que se le pidió. Pero un clic equivocado en un cliente borra trabajo pendiente sin ningún aviso. Es una **regla de negocio** que falta: lo resolverás en el paso 8.

### Punto débil 3: "Bad Request" sin explicación

Las dos peticiones ilegibles responden `400`, que es el código correcto, pero el cuerpo solo dice `"title": "Bad Request"`. El cliente no sabe **qué** está mal: ¿el JSON? ¿el parámetro `status`? Mira la consola de la API y verás que el servidor sí lo sabe:

```
fail: Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware[1]
      An unhandled exception has occurred while executing the request.
      Microsoft.AspNetCore.Http.BadHttpRequestException: Failed to read parameter "CreateProjectRequest request" from the request body as JSON.
```

En `Development`, Minimal APIs lanza una `BadHttpRequestException` (la opción `ThrowOnBadRequest`, que viste en el paso 10 del tutorial 2, vale `true` en ese entorno) y el `StatusCodeSelector` de `UseExceptionHandler` la convierte en `400`. El resultado: el cliente recibe poca información y el log se llena de entradas `fail` con la traza completa por un simple error del cliente. Lo mejorarás en el paso 9.

### Punto débil 4: el 409 de etiquetas depende de una sola comprobación

El `409` de `backend` funciona porque el handler `Create` de etiquetas pregunta antes de guardar:

```csharp
if (await db.Tags.AnyAsync(t => t.Name == name, cancellationToken))
```

Pero entre esa consulta y el `SaveChangesAsync` pasa un instante. Si dos peticiones crean la misma etiqueta a la vez, las dos pueden pasar la comprobación, y la segunda choca con el **índice único** de la base de datos. Ese choque llega como una `DbUpdateException` que nadie trata: un `500`. No es fácil provocarlo a mano enviando peticiones de una en una; en el paso 10 lo reproducirás de forma controlada y lo convertirás en un `409`.

### Punto débil 5: nadie detecta una actualización perdida

Este no está en `errors.http` porque, hoy, **no produce ningún error**, y ese es justo el problema. Imagina a Ana y a Luis abriendo la misma tarea en sus pantallas:

1. Los dos leen la tarea 4, *Fix the login crash*, con prioridad `High`.
2. Ana cambia el título a *Fix the login crash on Android* y guarda.
3. Luis, que sigue viendo la versión anterior, baja la prioridad a `Low` y guarda.

El `PUT` de Luis envía **todos** los campos, incluido el título que él leyó. El cambio de Ana desaparece y nadie se entera. Es una **actualización perdida** (*lost update*), y la resolverás con concurrencia optimista en el paso 11.

:::checkpoint La auditoría completa
1. Detén la API, recrea la base de datos (`Drop-Database` y `Update-Database`) y vuelve a ejecutarla.
2. Envía **en orden** todas las peticiones de `errors.http` y comprueba que obtienes exactamente los códigos de la tabla de la auditoría: `400`, `400`, `400`, `400`, `404`, `201`, `204`, `409`.
3. Reproduce la actualización perdida. Añade temporalmente estas dos peticiones al final de `errors.http` y envíalas en orden:

```http title="errors.http (peticiones temporales)"
### Ana saves first

PUT {{TaskTracker.Api_HostAddress}}/api/tasks/4
Content-Type: application/json

{
  "title": "Fix the login crash on Android",
  "priority": "High"
}

### Luis saves the copy he read before

PUT {{TaskTracker.Api_HostAddress}}/api/tasks/4
Content-Type: application/json

{
  "title": "Fix the login crash",
  "priority": "Low"
}
```

Las dos responden `204`. Ahora `GET /api/tasks/4` devuelve `"title": "Fix the login crash"` y `"priority": "Low"`: el título de Ana se perdió sin ningún aviso. (Las dos peticiones omiten `dueDate`, así que la fecha límite queda en `null`: un `PUT` reemplaza el recurso completo.)

4. **Borra las dos peticiones temporales.** `errors.http` debe quedar exactamente como lo creaste.
:::

:::troubleshooting Errores comunes
- **No aparece el enlace Send request en `errors.http`:** el archivo no tiene la extensión `.http` (por ejemplo, se llama `errors.http.txt`). Renómbralo en Solution Explorer.
- **Las peticiones responden `404` donde esperabas otra cosa:** la base de datos no está recién sembrada, o enviaste las peticiones en otro orden (por ejemplo, el `DELETE` del proyecto 1 antes que el `POST` de la tarea). Repite `Drop-Database` + `Update-Database`.
- **`Drop-Database` falla con `The process cannot access the file ... because it is being used by another process`:** la API (o tu visor de SQLite) tiene el archivo abierto. Ciérralos y repite.
- **Todas las peticiones fallan con un error de conexión:** la API no se está ejecutando, o tu puerto no coincide con el de la primera línea del archivo. Compara con `Properties/launchSettings.json`.
- **`warn: ...HttpsRedirectionMiddleware[3] Failed to determine the https port for redirect.`:** inofensivo con el perfil `http`, como en los tutoriales anteriores.
:::

:::recap
- Partes del proyecto del tutorial 2 (el tuyo o `reference-solutions/02-task-tracker-api/`) con la base de datos recién sembrada.
- **`errors.http`** reúne una petición por cada error, agrupadas por código de estado. `TaskTracker.Api.http` se queda con el camino feliz y termina en `### Error cases live in errors.http`.
- Lo que ya funciona: la validación con DataAnnotations (`400`), el `404` con `ProblemDetails` y el `409` de etiquetas duplicadas.
- Los cinco puntos débiles: una **fecha límite en el pasado** se acepta, **borrar un proyecto** se lleva sus tareas abiertas, las peticiones ilegibles dan un **`400` sin explicación**, el `409` de etiquetas depende de **una sola comprobación** y nadie detecta una **actualización perdida**.

En el siguiente paso atacarás el primero con las herramientas que ya conoces, DataAnnotations e `IValidatableObject`, y descubrirás hasta dónde llegan.
:::
