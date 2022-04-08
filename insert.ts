import got from "got";
import fs from "fs";

const http = got.extend({ retry: { limit: 1 } });

const operation = `
mutation ObservatoryMigrateProjects($projects: [projects_insert_input!]!) {
  insert_projects(objects: $projects, on_conflict: {
    constraint: projects_title_key, 
    update_columns: [
      title,
      created_at,
      description,
      homepage_url,
      repository_urls,
      stack,
      title
    ]
  }) {
    affected_rows
    returning {
      project_id
      title
      homepage_url
      description
      created_at
      repository_urls
      stack
    }
  }
}`;

async function main() {
  let projectsParsed = JSON.parse(fs.readFileSync("projects.json", "utf8"));
  const data = projectsParsed.data;

  const newData = new Map<string, Record<string, any>>();
  for (let i = 0; i < data.length; ++i) {
    const x = data[i];
    let elem = newData.get(x.title) ?? {};
    elem.title = x.name;
    elem.description = x.description;
    if (x.websiteUrl) {
      elem.homepage_url = x.websiteUrl;
    }
    if (x.repositories && x.repositories.length > 0) {
      const repos = x.repositories.map((x: string) => {
        if (x.match(/https?:\/\/.+/) == null) {
          return "https://" + x;
        } else {
          return x;
        }
      });
      if (x.repositories[0] !== "") {
        elem.repository_urls = `{"${repos.join('","')}"}`;
      } else {
        elem.repository_urls = "{}";
      }
    }
    if (x.tech && x.tech.length > 0) {
      elem.stack = `{"${x.tech.join('","')}"}`;
    }
    if (x.createdAt) {
      elem.created_at = x.createdAt.$date;
    } else {
      elem.created_at = "2016-04-21T20:58:20.49+00:00";
      // old products without created at should not go in front of modern projects
    }
    if (x.updatedAt) {
      elem.updated_at = x.updatedAt.$date;
    }
    newData.set(elem.title, elem);
  }
  try {
    // for (const x of newData) {
    const res = await http
      .post("http://localhost:8000/v1/graphql", {
        json: {
          query: operation,
          variables: { projects: Array.from(newData.values()) },
          operationName: "ObservatoryMigrateProjects",
        },
        headers: {
          "x-hasura-admin-secret": process.env.HASURA_GRAPHQL_ADMIN_SECRET,
        },
      })
      .json<Record<string, any>>();
    if (res.errors) {
      console.dir({ res: res }, { depth: Infinity });
      return;
      // break;
    }
    // console.log(`Inserted ${x.title}`);
    // }
  } catch (err) {
    console.dir(err);
  }
  console.log(`finished ${newData.size} inserts`);
}

main().catch(console.dir);
