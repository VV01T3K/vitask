using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace backend;

public sealed class VitaskDbContext(DbContextOptions<VitaskDbContext> options) : DbContext(options)
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TimerDefinition> Timers => Set<TimerDefinition>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.ToTable("Tasks");
            entity.HasKey(task => task.Id);
            entity.Property(task => task.Title).HasMaxLength(120).IsRequired();
            entity.Property(task => task.IsCompleted).IsRequired();
            entity.Property(task => task.CreatedAt).IsRequired();
        });

        modelBuilder.Entity<TimerDefinition>(entity =>
        {
            entity.ToTable("Timers");
            entity.HasKey(timer => timer.Id);
            entity.Property(timer => timer.Title).HasMaxLength(120).IsRequired();
            entity.Property(timer => timer.Description).HasMaxLength(240).IsRequired();
            entity.Property(timer => timer.DurationSeconds).IsRequired();
            entity.Property(timer => timer.AiInstructions).HasMaxLength(1_000).IsRequired();
            entity.Property(timer => timer.IsDefault).IsRequired();
            entity.Property(timer => timer.CreatedAt).IsRequired();
        });
    }
}

public sealed class TaskItem
{
    public Guid Id { get; set; }

    public required string Title { get; set; }

    public bool IsCompleted { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class TimerDefinition
{
    public Guid Id { get; set; }

    public required string Title { get; set; }

    public required string Description { get; set; }

    public int DurationSeconds { get; set; }

    public required string AiInstructions { get; set; }

    public bool IsDefault { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public static class DatabaseExtensions
{
    public static IServiceCollection AddInMemorySqliteDatabase(this IServiceCollection services)
    {
        services.AddSingleton(_ =>
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            connection.Open();
            return connection;
        });

        services.AddDbContext<VitaskDbContext>(
            (serviceProvider, options) =>
                options.UseSqlite(serviceProvider.GetRequiredService<SqliteConnection>())
        );

        return services;
    }

    public static WebApplication EnsureDatabaseCreated(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<VitaskDbContext>();
        dbContext.Database.EnsureCreated();
        SeedDefaultTimers(dbContext);

        return app;
    }

    private static void SeedDefaultTimers(VitaskDbContext dbContext)
    {
        if (dbContext.Timers.Any(timer => timer.IsDefault))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;

        dbContext.Timers.AddRange(
            new TimerDefinition
            {
                Id = Guid.NewGuid(),
                Title = "Hydration",
                Description = "Drink some water",
                DurationSeconds = 60 * 60,
                AiInstructions =
                    "When this fires, remind me to drink water. Keep it punchy, warm, and energizing.",
                IsDefault = true,
                CreatedAt = now,
            },
            new TimerDefinition
            {
                Id = Guid.NewGuid(),
                Title = "Eye Rest (20-20-20)",
                Description = "Look 20 feet away for 20 seconds",
                DurationSeconds = 20 * 60,
                AiInstructions =
                    "When this fires, remind me to look 20 feet away for 20 seconds and reset my eyes.",
                IsDefault = true,
                CreatedAt = now,
            }
        );

        dbContext.SaveChanges();
    }
}
