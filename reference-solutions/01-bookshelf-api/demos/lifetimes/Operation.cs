namespace Bookshelf.Api.Lifetimes;

public interface IOperation
{
    Guid OperationId { get; }
}

public interface ISingletonOperation : IOperation;
public interface IScopedOperation : IOperation;
public interface ITransientOperation : IOperation;

// One class, registered three times with a different lifetime each time.
// Every new instance gets its own Guid, so the Guid tells us which instance we received.
public class Operation : ISingletonOperation, IScopedOperation, ITransientOperation
{
    public Guid OperationId { get; } = Guid.NewGuid();
}
