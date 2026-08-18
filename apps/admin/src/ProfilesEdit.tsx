import { BooleanInput, Edit, SimpleForm, TextInput } from "react-admin";
// #845 — profiles are destructive to delete, so the edit view uses the
// typed-confirmation toolbar instead of EditGuesser's stock delete button.
import { ConfirmDeleteToolbar } from "./ConfirmDelete";

export default function ProfilesEdit() {
  return (
    <Edit>
      <SimpleForm
        toolbar={
          <ConfirmDeleteToolbar
            getConfirmText={(record) =>
              record?.email ?? record?.display_name ?? String(record?.id ?? "")
            }
            cascadeNote="Deleting this profile also permanently deletes every kid, their progress, and their stories."
          />
        }
      >
        <TextInput source="email" />
        <TextInput source="display_name" />
        <BooleanInput source="aggregate_opt_in" />
      </SimpleForm>
    </Edit>
  );
}
