using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace backend;

public record CreateTimerRequest
{
    public string? Title { get; init; }

    public string? Description { get; init; }

    public int DurationSeconds { get; init; }

    public string? AiInstructions { get; init; }

    public string? Icon { get; init; }

    public string? Color { get; init; }
}

public record UpdateTimerRequest
{
    public string? Title { get; init; }

    public string? Description { get; init; }

    public int DurationSeconds { get; init; }

    public string? AiInstructions { get; init; }

    public string? Icon { get; init; }

    public string? Color { get; init; }
}

public record TimerResponse(
    Guid Id,
    string Title,
    string Description,
    int DurationSeconds,
    string AiInstructions,
    string Icon,
    string Color,
    bool IsDefault,
    DateTimeOffset CreatedAt
);

public sealed class CreateTimerRequestValidator : AbstractValidator<CreateTimerRequest>
{
    public CreateTimerRequestValidator()
    {
        RuleFor(timer => timer.Title).NotEmpty().Length(2, 120);
        RuleFor(timer => timer.Description).NotEmpty().MaximumLength(240);
        RuleFor(timer => timer.DurationSeconds).InclusiveBetween(15, 24 * 60 * 60);
        RuleFor(timer => timer.AiInstructions).NotEmpty().MaximumLength(1_000);
        RuleFor(timer => timer.Icon).MaximumLength(64).When(r => r.Icon is not null);
        RuleFor(timer => timer.Color).MaximumLength(16).When(r => r.Color is not null);
    }
}

public sealed class UpdateTimerRequestValidator : AbstractValidator<UpdateTimerRequest>
{
    public UpdateTimerRequestValidator()
    {
        RuleFor(timer => timer.Title).NotEmpty().Length(2, 120);
        RuleFor(timer => timer.Description).NotEmpty().MaximumLength(240);
        RuleFor(timer => timer.DurationSeconds).InclusiveBetween(15, 24 * 60 * 60);
        RuleFor(timer => timer.AiInstructions).NotEmpty().MaximumLength(1_000);
        RuleFor(timer => timer.Icon).MaximumLength(64).When(r => r.Icon is not null);
        RuleFor(timer => timer.Color).MaximumLength(16).When(r => r.Color is not null);
    }
}

public static class TimerEndpoints
{
    private const string DefaultIcon = "clock";
    private const string DefaultColor = "#4f8fea";

    public static IEndpointRouteBuilder MapTimerEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var timers = endpoints.MapGroup("/timers").WithTags("Timers");

        timers
            .MapPost(
                "",
                async Task<IResult> (
                    CreateTimerRequest request,
                    VitaskDbContext dbContext,
                    CancellationToken cancellationToken
                ) =>
                {
                    var timer = new TimerDefinition
                    {
                        Id = Guid.NewGuid(),
                        Title = request.Title!.Trim(),
                        Description = request.Description!.Trim(),
                        DurationSeconds = request.DurationSeconds,
                        AiInstructions = request.AiInstructions!.Trim(),
                        Icon = string.IsNullOrWhiteSpace(request.Icon)
                            ? DefaultIcon
                            : request.Icon.Trim(),
                        Color = string.IsNullOrWhiteSpace(request.Color)
                            ? DefaultColor
                            : request.Color.Trim(),
                        IsDefault = false,
                        CreatedAt = DateTimeOffset.UtcNow,
                    };

                    dbContext.Timers.Add(timer);
                    await dbContext.SaveChangesAsync(cancellationToken);

                    return TypedResults.Created($"/timers/{timer.Id}", timer.ToResponse());
                }
            )
            .WithName("CreateTimer")
            .WithSummary("Create a timer")
            .WithFluentValidation<CreateTimerRequest>()
            .Produces<TimerResponse>(StatusCodes.Status201Created)
            .ProducesValidationProblem();

        timers
            .MapGet(
                "",
                async (VitaskDbContext dbContext, CancellationToken cancellationToken) =>
                {
                    return await dbContext
                        .Timers.AsNoTracking()
                        .OrderByDescending(timer => timer.IsDefault)
                        .ThenBy(timer => timer.Title)
                        .ThenBy(timer => timer.Id)
                        .Select(timer => timer.ToResponse())
                        .ToArrayAsync(cancellationToken);
                }
            )
            .WithName("ListTimers")
            .WithSummary("List timers")
            .Produces<TimerResponse[]>();

        timers
            .MapPut(
                "/{id:guid}",
                async Task<IResult> (
                    Guid id,
                    UpdateTimerRequest request,
                    VitaskDbContext dbContext,
                    CancellationToken cancellationToken
                ) =>
                {
                    var timer = await dbContext.Timers.FirstOrDefaultAsync(
                        t => t.Id == id,
                        cancellationToken
                    );
                    if (timer is null)
                    {
                        return TypedResults.NotFound();
                    }

                    timer.Title = request.Title!.Trim();
                    timer.Description = request.Description!.Trim();
                    timer.DurationSeconds = request.DurationSeconds;
                    timer.AiInstructions = request.AiInstructions!.Trim();
                    timer.Icon = string.IsNullOrWhiteSpace(request.Icon)
                        ? timer.Icon
                        : request.Icon.Trim();
                    timer.Color = string.IsNullOrWhiteSpace(request.Color)
                        ? timer.Color
                        : request.Color.Trim();

                    await dbContext.SaveChangesAsync(cancellationToken);

                    return TypedResults.Ok(timer.ToResponse());
                }
            )
            .WithName("UpdateTimer")
            .WithSummary("Update a timer")
            .WithFluentValidation<UpdateTimerRequest>()
            .Produces<TimerResponse>()
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem();

        timers
            .MapDelete(
                "/{id:guid}",
                async Task<IResult> (
                    Guid id,
                    VitaskDbContext dbContext,
                    CancellationToken cancellationToken
                ) =>
                {
                    var timer = await dbContext.Timers.FirstOrDefaultAsync(
                        t => t.Id == id,
                        cancellationToken
                    );
                    if (timer is null)
                    {
                        return TypedResults.NotFound();
                    }

                    if (timer.IsDefault)
                    {
                        return TypedResults.Conflict();
                    }

                    dbContext.Timers.Remove(timer);
                    await dbContext.SaveChangesAsync(cancellationToken);

                    return TypedResults.NoContent();
                }
            )
            .WithName("DeleteTimer")
            .WithSummary("Delete a timer")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        return endpoints;
    }

    private static TimerResponse ToResponse(this TimerDefinition timer)
    {
        return new TimerResponse(
            timer.Id,
            timer.Title,
            timer.Description,
            timer.DurationSeconds,
            timer.AiInstructions,
            timer.Icon,
            timer.Color,
            timer.IsDefault,
            timer.CreatedAt
        );
    }
}
