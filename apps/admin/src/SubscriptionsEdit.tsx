import { DateTimeInput, Edit, SimpleForm, TextInput } from "react-admin";
// #845 — subscriptions are destructive to delete; confirm by typing the id.
import { ConfirmDeleteToolbar } from "./ConfirmDelete";

export default function SubscriptionsEdit() {
  return (
    <Edit>
      <SimpleForm
        toolbar={<ConfirmDeleteToolbar getConfirmText={(record) => String(record?.id ?? "")} />}
      >
        <TextInput source="profile_id" />
        <TextInput source="plan" />
        <TextInput source="store" />
        <TextInput source="store_ref" />
        <TextInput source="status" />
        <DateTimeInput source="current_period_end" />
      </SimpleForm>
    </Edit>
  );
}
