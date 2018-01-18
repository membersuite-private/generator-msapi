# generator-api
Generators for REST-API in the `portal-api` project.  Note, on Windows, you must run this in [Windows Subsustem for Linux](https://docs.microsoft.com/en-us/windows/wsl/install-win10)

It's best to run this on a clean local repo to be able to see the changes.

# Usage
```bash
# switch to portal-api folder
cd /mnt/c/code/portal-api

# generate the objects used in the API by parsing the Swagger
npm run definitions

# run the generation, it will start to prompt
npm run msapi
```
## Prompts
* **MemberSuite Module?** select the module for the new API
* **Events Endpoint?** for now, always select `CREATE NEW`
* **Endpoint Name (will live under events)?** is the arbitrary name of the new endpoint, in caMel case.
* **Method?** select the HTTP method
* **Relative route?** enter the route, or take the default if ok
* **Helper name?** usually the default will be ok.
* **What type to return?** select the type from a list.  If you don't see it make sure the API in C# is decorated with `SwaggerResponse`

## Finishing Up
If the helper method is `GetAvailableCapacity`, do the following:
* Edit `helper.model.ts` to import the REST return value, and the URL mapping to it
* Edit `getAvailableCapacity.ts` and remove the TODOs
* Edit `getAvailableCapacity.data.ts` to create sample data for tests that will look like the object in `getAvailableCapacity.d.ts`
* Add test(s) to the appropriate `*.spec.ts` file

## Debugging
The easiest way to debug it, is to edit `.\node_modules\generator-msapi\app\index.js` for testing, then manually merge changes into this repo.
