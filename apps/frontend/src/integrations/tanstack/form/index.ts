import { createFormHook } from "@tanstack/react-form";

import { Select, SubscribeButton, TextArea, TextField } from "../../../components/form";
import { fieldContext, formContext } from "./context";

export const { useAppForm } = createFormHook({
  fieldComponents: {
    TextField,
    Select,
    TextArea,
  },
  formComponents: {
    SubscribeButton,
  },
  fieldContext,
  formContext,
});
