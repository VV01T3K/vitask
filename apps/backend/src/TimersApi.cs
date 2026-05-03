using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace backend;

public record CreateTimerRequest
{
    public string? Title { get; init; }

    public string? Description { get; init; }

    public int DurationSeconds { get; init; }

    public string? AiInstructions { get; init; }
}

public record TimerResponse(
    Guid Id,
    string Title,
    string Description,
    int DurationSeconds,
    string AiInstructions,
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
    }
}

public static class TimerEndpoints
{
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
                        IsDefault = false,
                        CreatedAt = DateTimeOffset.UtcNow,
                    };

                    dbContext.Timers.Add(timer);
                    await dbContext.SaveChangesAsync(cancellationToken);

                    var response = timer.ToResponse();

                    return TypedResults.Created($"/timers/{response.Id}", response);
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
            timer.IsDefault,
            timer.CreatedAt
        );
    }
}
