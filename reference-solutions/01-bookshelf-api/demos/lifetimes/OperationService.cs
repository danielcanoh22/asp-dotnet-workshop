namespace Bookshelf.Api.Lifetimes;

// A second consumer, so we can compare what the controller got with what this service got
// in the same request.
public class OperationService(
    ISingletonOperation singleton,
    IScopedOperation scoped,
    ITransientOperation transient)
{
    public ISingletonOperation Singleton { get; } = singleton;
    public IScopedOperation Scoped { get; } = scoped;
    public ITransientOperation Transient { get; } = transient;
}
