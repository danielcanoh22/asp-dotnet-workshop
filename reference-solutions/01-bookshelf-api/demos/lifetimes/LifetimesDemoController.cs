using Microsoft.AspNetCore.Mvc;

namespace Bookshelf.Api.Lifetimes;

[ApiController]
[Route("api/lifetimes-demo")]
public class LifetimesDemoController(
    ISingletonOperation singleton,
    IScopedOperation scoped,
    ITransientOperation transient,
    OperationService operationService) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        controller = new
        {
            singleton = singleton.OperationId,
            scoped = scoped.OperationId,
            transient = transient.OperationId
        },
        service = new
        {
            singleton = operationService.Singleton.OperationId,
            scoped = operationService.Scoped.OperationId,
            transient = operationService.Transient.OperationId
        }
    });
}
