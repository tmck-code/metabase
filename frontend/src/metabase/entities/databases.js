/* @flow weak */

import { normalize } from "normalizr";
import _ from "underscore";

import { createEntity } from "metabase/lib/entities";
import { fetchData, createThunkAction } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";

import { MetabaseApi } from "metabase/services";
import { DatabaseSchema } from "metabase/schema";
import Fields from "metabase/entities/fields";

import { getMetadata } from "metabase/selectors/metadata";

// OBJECT ACTIONS
export const FETCH_DATABASE_METADATA =
  "metabase/entities/database/FETCH_DATABASE_METADATA";

export const FETCH_DATABASE_IDFIELDS =
  "metabase/entities/database/FETCH_DATABASE_IDFIELDS";

const Databases = createEntity({
  name: "databases",
  path: "/api/database",
  schema: DatabaseSchema,

  nameOne: "database",
  nameMany: "databases",

  // ACTION CREATORS
  objectActions: {
    fetchDatabaseMetadata: createThunkAction(
      FETCH_DATABASE_METADATA,
      ({ id }, reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          requestStatePath: ["metadata", "databases", id],
          existingStatePath: ["metadata", "databases", id],
          getData: async () => {
            const databaseMetadata = await MetabaseApi.db_metadata({
              dbId: id,
            });
            return normalize(databaseMetadata, DatabaseSchema);
          },
          reload,
        }),
    ),

    fetchIdfields: createThunkAction(
      FETCH_DATABASE_IDFIELDS,
      ({ id }) => async () => {
        const idfields = await MetabaseApi.db_idfields({ dbId: id });
        const idfieldsWithDisplayName = idfields.map(field => {
          field.displayName =
            field.table.display_name + " → " + field.display_name;
          return field;
        });
        return normalize(idfieldsWithDisplayName, [Fields.schema]);
      },
    ),
  },

  selectors: {
    getHasSampleDataset: state =>
      _.any(Databases.selectors.getList(state), db => db.is_sample),
    getIdfields: (state, databaseId) =>
      Object.values(getMetadata(state).fields)
        .filter(f => f.table.db_id === databaseId && f.isPK())
        .map(field => {
          field.displayName =
            field.table.display_name + " → " + field.display_name;
          return field;
        }),
  },

  // FORM
  form: {
    fields: (values = {}) => [
      {
        name: "engine",
        type: "select",
        options: ENGINE_OPTIONS,
        placeholder: `Select a database`,
        initial: "postgres",
      },
      {
        name: "name",
        placeholder: `How would you like to refer to this database?`,
        validate: value => (!value ? `required` : null),
      },
      ...(getFieldsForEngine(values.engine, values) || []),
    ],
  },
});

export default Databases;

function getFieldsForEngine(engine, values) {
  const info = (MetabaseSettings.get("engines") || {})[engine];
  if (info) {
    const fields = [];
    for (const field of info["details-fields"]) {
      if (
        field.name.startsWith("tunnel-") &&
        field.name !== "tunnel-enabled" &&
        (!values.details || !values.details["tunnel-enabled"])
      ) {
        continue;
      }
      fields.push({
        name: "details." + field.name,
        title: field["display-name"],
        type: field.type,
        placeholder: field.placeholder || field.default,
        validate: value => (field.required && !value ? `required` : null),
        normalize: value =>
          value == "" || value == null
            ? "default" in field
              ? field.default
              : null
            : value,
      });
    }
    return fields;
  } else {
    return [];
  }
}

const ENGINE_OPTIONS = Object.entries(
  MetabaseSettings.get("engines") || {},
).map(([engine, info]) => ({
  name: info["driver-name"],
  value: engine,
}));
