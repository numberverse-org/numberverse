import { Admin, Resource, ListGuesser, EditGuesser, ShowGuesser } from "react-admin";
import Dashboard from "./Dashboard";
import { dataProvider } from "./dataProvider";
import { authProvider } from "./authProvider";
// #845 — destructive resources get typed-confirmation edit views.
// #847 — config gets a typed `adaptive` form instead of a raw JSON editor.
import ProfilesEdit from "./ProfilesEdit";
import KidsEdit from "./KidsEdit";
import SubscriptionsEdit from "./SubscriptionsEdit";
import ConfigEdit from "./ConfigEdit";

export default function App() {
  return (
    <Admin dataProvider={dataProvider} authProvider={authProvider} dashboard={Dashboard}>
      <Resource name="profiles" list={ListGuesser} edit={ProfilesEdit} show={ShowGuesser} />
      <Resource name="kids" list={ListGuesser} edit={KidsEdit} show={ShowGuesser} />
      <Resource name="kid_settings" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="skills" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="content_items" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="config" list={ListGuesser} edit={ConfigEdit} show={ShowGuesser} />
      <Resource name="subscriptions" list={ListGuesser} edit={SubscriptionsEdit} show={ShowGuesser} />
    </Admin>
  );
}
