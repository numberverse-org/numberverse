import { Admin, Resource, ListGuesser, EditGuesser, ShowGuesser } from "react-admin";
import Dashboard from "./Dashboard";
import { dataProvider } from "./dataProvider";
import { authProvider } from "./authProvider";

export default function App() {
  return (
    <Admin dataProvider={dataProvider} authProvider={authProvider} dashboard={Dashboard}>
      <Resource name="profiles" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="kids" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="kid_settings" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="skills" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="content_items" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="config" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="subscriptions" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
    </Admin>
  );
}
