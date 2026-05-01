using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace backend;

public sealed class VitaskDbContext(DbContextOptions<VitaskDbContext> options) : DbContext(options)
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.ToTable("Tasks");
            entity.HasKey(task => task.Id);
            entity.Property(task => task.Title).HasMaxLength(120).IsRequired();
            entity.Property(task => task.Notes).HasMaxLength(1_000);
        });
    }
}

public sealed class TaskItem
{
    public Guid Id { get; set; }

    public required string Title { get; set; }

    public string? Notes { get; set; }

    public DateOnly? DueDate { get; set; }
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

        return app;
    }
}
