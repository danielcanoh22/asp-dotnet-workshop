using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator(TimeProvider timeProvider)
    {
        RuleFor(x => x.Title).RequiredText(200);
        RuleFor(x => x.Description).MaximumLength(2000);

        // A new task cannot be born overdue. Only checked when a due date is sent.
        RuleFor(x => x.DueDate)
            .Must(dueDate => dueDate >= DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime))
            .When(x => x.DueDate is not null)
            .WithMessage("The due date cannot be in the past.");
    }
}

public class UpdateTaskRequestValidator : AbstractValidator<UpdateTaskRequest>
{
    public UpdateTaskRequestValidator()
    {
        RuleFor(x => x.Title).RequiredText(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Version).NotNull();
    }
}

public class AssignTagRequestValidator : AbstractValidator<AssignTagRequest>
{
    public AssignTagRequestValidator()
    {
        RuleFor(x => x.TagId).GreaterThan(0);
    }
}
