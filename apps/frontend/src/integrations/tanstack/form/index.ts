import { createFormHook } from "@tanstack/react-form";

import { DateField, Select, SubscribeButton, TextArea, TextField } from "../../../components/form";
import { fieldContext, formContext } from "./context";

export const { useAppForm } = createFormHook({
  fieldComponents: {
    TextField,
    DateField,
    Select,
    TextArea,
  },
  formComponents: {
    SubscribeButton,
  },
  fieldContext,
  formContext,
});
