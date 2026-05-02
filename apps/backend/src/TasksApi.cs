using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace backend;

public record CreateTaskRequest
{
    public string? Title { get; init; }
}

public record SetTaskCompletionRequest
{
    public bool IsCompleted { get; init; }
}

public record TaskResponse(
    Guid Id,
    string Title,
    bool IsCompleted,
    DateTimeOffset? CompletedAt,
    DateTimeOffset CreatedAt
);

public sealed class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(task => task.Title).NotEmpty().Length(3, 120);
    }
}

public sealed class SetTaskCompletionRequestValidator : AbstractValidator<SetTaskCompletionRequest>
{
    public SetTaskCompletionRequestValidator() { }
}

public static class TaskEndpoints
{
    public static IEndpointRouteBuilder MapTaskEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var tasks = endpoints.MapGroup("/tasks").WithTags("Tasks");

        tasks
            .MapPost(
                "",
                async Task<IResult> (
                    CreateTaskRequest request,
                    VitaskDbContext dbContext,
                    CancellationToken cancellationToken
                ) =>
                {
                    var task = new TaskItem
                    {
                        Id = Guid.NewGuid(),
                        Title = request.Title!.Trim(),
                        IsCompleted = false,
                        CompletedAt = null,
                        CreatedAt = DateTimeOffset.UtcNow,
                    };

                    dbContext.Tasks.Add(task);
                    await dbContext.SaveChangesAsync(cancellationToken);

                    var response = task.ToResponse();

                    return TypedResults.Created($"/tasks/{response.Id}", response);
                }
            )
            .WithName("CreateTask")
            .WithSummary("Create a task")
            .WithFluentValidation<CreateTaskRequest>()
            .Produces<TaskResponse>(StatusCodes.Status201Created)
            .ProducesValidationProblem();

        tasks
            .MapGet(
                "",
                async (VitaskDbContext dbContext, CancellationToken cancellationToken) =>
                {
                    var taskRows = await dbContext
                        .Tasks.AsNoTracking()
                        .Select(task => task.ToResponse())
                        .ToArrayAsync(cancellationToken);

                    return taskRows
                        .OrderBy(task => task.IsCompleted)
                        .ThenByDescending(task => task.CreatedAt)
                        .ThenBy(task => task.Id)
                        .ToArray();
                }
            )
            .WithName("ListTasks")
            .WithSummary("List tasks")
            .Produces<TaskResponse[]>();

        tasks
            .MapGet(
                "/{id:guid}",
                async Task<IResult> (
                    Guid id,
                    VitaskDbContext dbContext,
                    CancellationToken cancellationToken
                ) =>
                {
                    var task = await dbContext
                        .Tasks.AsNoTracking()
                        .Where(task => task.Id == id)
                        .Select(task => task.ToResponse())
                        .FirstOrDefaultAsync(cancellationToken);

                    return task is null ? TypedResults.NotFound() : TypedResults.Ok(task);
                }
            )
            .WithName("GetTask")
            .WithSummary("Get a task")
            .Produces<TaskResponse>()
            .Produces(StatusCodes.Status404NotFound);

        tasks
            .MapPut(
                "/{id:guid}/completion",
                async Task<IResult> (
                    Guid id,
                    SetTaskCompletionRequest request,
                    VitaskDbContext dbContext,
                    CancellationToken cancellationToken
                ) =>
                {
                    var task = await dbContext.Tasks.FirstOrDefaultAsync(
                        task => task.Id == id,
                        cancellationToken
                    );
                    if (task is null)
                    {
                        return TypedResults.NotFound();
                    }

                    task.IsCompleted = request.IsCompleted;
                    task.CompletedAt = request.IsCompleted ? DateTimeOffset.UtcNow : null;

                    await dbContext.SaveChangesAsync(cancellationToken);

                    return TypedResults.Ok(task.ToResponse());
                }
            )
            .WithName("SetTaskCompletion")
            .WithSummary("Set task completion")
            .WithFluentValidation<SetTaskCompletionRequest>()
            .Produces<TaskResponse>()
            .Produces(StatusCodes.Status404NotFound);

        tasks
            .MapDelete(
                "/{id:guid}",
                async Task<IResult> (
                    Guid id,
                    VitaskDbContext dbContext,
                    CancellationToken cancellationToken
                ) =>
                {
                    var deletedCount = await dbContext
                        .Tasks.Where(task => task.Id == id)
                        .ExecuteDeleteAsync(cancellationToken);

                    return deletedCount == 0 ? TypedResults.NotFound() : TypedResults.NoContent();
                }
            )
            .WithName("DeleteTask")
            .WithSummary("Delete a task")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound);

        return endpoints;
    }

    private static TaskResponse ToResponse(this TaskItem task)
    {
        return new TaskResponse(
            task.Id,
            task.Title,
            task.IsCompleted,
            task.CompletedAt,
            task.CreatedAt
        );
    }
}

public static class ValidationExtensions
{
    public static RouteHandlerBuilder WithFluentValidation<TRequest>(
        this RouteHandlerBuilder builder
    )
    {
        return builder.AddEndpointFilter(
            async (context, next) =>
            {
                var request = context.Arguments.OfType<TRequest>().FirstOrDefault();
                if (request is null)
                {
                    return await next(context);
                }

                var validator = context.HttpContext.RequestServices.GetService<
                    IValidator<TRequest>
                >();
                if (validator is null)
                {
                    return await next(context);
                }

                var validationResult = await validator.ValidateAsync(
                    request,
                    context.HttpContext.RequestAborted
                );
                if (validationResult.IsValid)
                {
                    return await next(context);
                }

                var errors = validationResult
                    .Errors.GroupBy(error => error.PropertyName)
                    .ToDictionary(
                        group => group.Key,
                        group => group.Select(error => error.ErrorMessage).ToArray()
                    );

                return TypedResults.ValidationProblem(errors);
            }
        );
    }
}
