import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { useAppForm } from "#/integrations/tanstack/form";

export const Route = createFileRoute("/form/simple")({
  component: SimpleForm,
});

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
});

function SimpleForm() {
  const form = useAppForm({
    defaultValues: {
      title: "",
      description: "",
    },
    validators: {
      onBlur: schema,
    },
    onSubmit: ({ value }) => {
      console.log(value);
      // Show success message
      alert("Form submitted successfully!");
    },
  });

  return (
    <main>
      <h1>Simple Form</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.AppField name="title">{(field) => <field.TextField label="Title" />}</form.AppField>

        <form.AppField name="description">
          {(field) => <field.TextArea label="Description" />}
        </form.AppField>

        <form.AppForm>
          <form.SubscribeButton label="Submit" />
        </form.AppForm>
      </form>
    </main>
  );
}
