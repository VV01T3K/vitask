using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace backend;

public record CreateTaskRequest
{
    public string? Title { get; init; }

    public string? Notes { get; init; }

    public DateOnly? DueDate { get; init; }
}

public record TaskResponse(Guid Id, string Title, string? Notes, DateOnly? DueDate);

public sealed class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(task => task.Title).NotEmpty().Length(3, 120);
        RuleFor(task => task.Notes).MaximumLength(1_000);
    }
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
                        Notes = request.Notes?.Trim(),
                        DueDate = request.DueDate,
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
                    return await dbContext
                        .Tasks.AsNoTracking()
                        .OrderBy(task => task.Title)
                        .ThenBy(task => task.Id)
                        .Select(task => new TaskResponse(
                            task.Id,
                            task.Title,
                            task.Notes,
                            task.DueDate
                        ))
                        .ToArrayAsync(cancellationToken);
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
                        .Select(task => new TaskResponse(
                            task.Id,
                            task.Title,
                            task.Notes,
                            task.DueDate
                        ))
                        .FirstOrDefaultAsync(cancellationToken);

                    return task is null ? TypedResults.NotFound() : TypedResults.Ok(task);
                }
            )
            .WithName("GetTask")
            .WithSummary("Get a task")
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
        return new TaskResponse(task.Id, task.Title, task.Notes, task.DueDate);
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
