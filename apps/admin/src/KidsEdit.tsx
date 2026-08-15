import { Edit, NumberInput, SimpleForm, TextInput } from "react-admin";
// #845 — kids are destructive to delete (cascades to their stories/settings).
import { ConfirmDeleteToolbar } from "./ConfirmDelete";

export default function KidsEdit() {
  return (
    <Edit>
      <SimpleForm
        toolbar={
          <ConfirmDeleteToolbar
            getConfirmText={(record) => record?.name ?? String(record?.id ?? "")}
          />
        }
      >
        <TextInput source="profile_id" />
        <TextInput source="name" />
        <TextInput source="avatar" />
        <NumberInput source="birth_year" />
        <NumberInput source="coins" />
      </SimpleForm>
    </Edit>
  );
}
