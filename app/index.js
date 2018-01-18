var Generator = require('yeoman-generator');
var File = require('fs');
var inquirer = require('inquirer');
var YAML = require('yamljs');
var ejs = require('ejs');
var pathToModule = __dirname;
const execSync = require('child_process').execSync;

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);
    this.isNewEndpoint = false;
    this.choices = {};
    this.viewHelpers = {
      capitalize: function(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
      },

      lowercase: function(str) {
        return str.toLowerCase();
      },

      getDataTypeFromPath: function(in_path, module_name) {
        var path = `./definitions/${module_name}`;
        return execSync('head -n 1 ' + path + '/' + in_path).toString().trim().split(' ')[2];
      }
    };

    this.queuedFilePath = '';
    this.queuedFileContents = '';
    
    this._reloadServerlessConfig();
  }

  ask_module() {
    var moduleNames = File.readdirSync('./definitions');
    
    return this.prompt([
      {
        type: 'list',
        message: 'MemberSuite Module?',
        name: 'module_name',
        choices: moduleNames
      }
    ]).then((chosen_module) => {
      Object.assign(this.choices, chosen_module);
    });
    
  }

  ask_endpoint() {
    var contextualEndpointNames = File.readdirSync(`./src/lambdas/${this.choices.module_name}`);

    contextualEndpointNames.unshift(new inquirer.Separator());
    contextualEndpointNames.unshift('CREATE NEW');
    contextualEndpointNames.push(new inquirer.Separator());
    
    return this.prompt([
      {
        type: 'list',
        message: `${this.viewHelpers.capitalize(this.choices.module_name)} Endpoint?`,
        name: 'endpoint_name',
        choices: contextualEndpointNames
      }
    ]).then((chosen_endpoint) => {
      if(chosen_endpoint.endpoint_name == 'CREATE NEW') {
        this.isNewEndpoint = true;
      }
      
      Object.assign(this.choices, chosen_endpoint);
    });
    
  }

  ask_new_endpoint() {
    if(!this.isNewEndpoint) {
      return true;
    }
    
    return this.prompt([
      {
        type: 'string',
        message: `Endpoint Name (will live under ${this.choices.module_name})?`,
        name: 'endpoint_name'
      }
      
    ]).then((chosen_endpoint) => {
      Object.assign(this.choices, chosen_endpoint);
    });
    
  }

  ask_methods() {
    var implemented = this._implemented_methods_for(this.choices.module_name, this.choices.endpoint_name);
    return this.prompt([
      {
        type: 'list',
        message: `Method?`,
        name: 'method_name',
        choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
      }
    ]).then((chosen_method) => {
      Object.assign(this.choices, chosen_method);
    });
    
  }

  ask_path() {
    return this.prompt([
      {
        type: 'string',
        message: `Relative route?`,
        name: 'path',
        default: this.choices.module_name + '/:tenantId/' + this.choices.endpoint_name
      }
    ]).then((chosen_path) => {
      Object.assign(this.choices, chosen_path);
    });
  }

  ask_helper_name() {
    return this.prompt([
      {
        type: 'string',
        message: `Helper name?`,
        default: this.viewHelpers.lowercase(this.choices.method_name) + this.viewHelpers.capitalize(this.choices.endpoint_name),
        name: 'helper_name'
      }
    ]).then((chosen_helper_name) => {
      Object.assign(this.choices, chosen_helper_name);
    });
    
  }

  ask_data_type() {
    var path = `./definitions/${this.choices.module_name}`;
    var files = File.readdirSync(path);
    var types = files.map((def_file_path) => {
      return {name: execSync('head -n 1 ' + path + '/' + def_file_path).toString().trim().split(' ')[2], value: def_file_path};
    });

    return this.prompt([
      {
        type: 'list',
        message: `What type to return?`,
        choices: types,
        name: 'data_type_name'
      }
    ]).then((chosen_data_type) => {
      Object.assign(this.choices, chosen_data_type);
    });
    
  }
  
  emit_endpoint_lambda() {
    // Will use snippets to add to existing handlers
    if(!this.isNewEndpoint) {
      this._emit_lambda_helper_and_definition_into_existing();
    } else {
      var targetModuleDir = `./src/lambdas/${this.choices.module_name}`;
      var targetEndpointDir = `${targetModuleDir}/${this.choices.endpoint_name}`;
      if(!File.existsSync(targetModuleDir)){
        File.mkdirSync(targetModuleDir);
      }

      if(!File.existsSync(targetEndpointDir)){
        File.mkdirSync(targetEndpointDir);
      }
      
      this._emit_lambda_helper_and_definition_into_new();
      this._emit_endpoint_data_definition_into_new();
      this._emit_model_into_new();
      this._emit_data_stub_into_new();
      this._emit_data_stub_helper_into_stub_helpers();
      this._emit_route_helper_into_route_helpers();
      this._emit_serverless_config_into_serverless_yml();
    }
    
  }

  _emit_route_helper_into_route_helpers() {
    var existing_route_helpers_path = `./src/routes/routes.${this.choices.module_name}.ts`;
    var existing_route_helpers_contents = File.readFileSync(existing_route_helpers_path, 'utf8');
    var raw_route_import_template = File.readFileSync(pathToModule + '/templates/routes/routes.module.import.ts.template', 'utf8');
    var raw_route_handler_template = File.readFileSync(pathToModule + '/templates/routes/routes.module.handler.ts.template', 'utf8');

    var rendered_import = ejs.render(raw_route_import_template, Object.assign(this.choices, this.viewHelpers));
    var rendered_definition = ejs.render(raw_route_handler_template, Object.assign(this.choices, this.viewHelpers));

    var final_import_match = existing_route_helpers_contents.match(/import \{(.+)\}(\s+)from(.+)\;/g).pop();
    var final_import_index = existing_route_helpers_contents.indexOf(final_import_match);

    var existing_route_helpers_contents_with_import = existing_route_helpers_contents.substring(0, final_import_index + final_import_match.length) +
        '\n' + rendered_import +
        existing_route_helpers_contents.substring(final_import_index + final_import_match.length);

    var route_match = existing_route_helpers_contents_with_import.match(/public static init\(\)\: Router \{$/);
    var route_match_index = route_match.index;

    var existing_route_helpers_contents_with_import_and_definition = existing_route_helpers_contents_with_import.substring(0, route_match_index + route_match[0].length) +
        '\n  ' + rendered_definition +
        existing_route_helpers_contents_with_import.substring(route_match_index + route_match[0].length);

    File.writeFileSync(`./src/routes/routes.${this.choices.module_name}.ts`, existing_route_helpers_contents_with_import_and_definition);
  }

  _emit_serverless_config_into_serverless_yml() {
    var existing_yaml_path = './serverless.yml';
    var existing_yaml_contents = File.readFileSync(existing_yaml_path, 'utf8');
    var raw_serverless_route_template = File.readFileSync(pathToModule + '/templates/serverless.yml.template', 'utf8');

    var rendered_serveless_route_template = ejs.render(raw_serverless_route_template, Object.assign(this.choices, this.viewHelpers));

    var match = existing_yaml_contents.match(/functions\:/);
    var match_index = match.index;
    
    var existing_yaml_path_with_new_route = existing_yaml_contents.substring(0, match_index + match[0].length) +
        '\n' + rendered_serveless_route_template +
        existing_yaml_contents.substring(match_index + match[0].length);

    File.writeFileSync('./serverless.yml', existing_yaml_path_with_new_route);
  }

  _emit_data_stub_helper_into_stub_helpers() {
    var existing_stub_helpers_path = `./src/helpers/helper.data.ts`;
    var existing_stub_helpers_contents = File.readFileSync(existing_stub_helpers_path, 'utf8');
    var raw_include_template = File.readFileSync(pathToModule + '/templates/helpers/helper.data.require.ts.template', 'utf8');
    var raw_definition_template = File.readFileSync(pathToModule + '/templates/helpers/helper.data.definition.ts.template', 'utf8');

    var rendered_include = ejs.render(raw_include_template, Object.assign(this.choices, this.viewHelpers));
    var rendered_definition = ejs.render(raw_definition_template, Object.assign(this.choices, this.viewHelpers));

    var final_import_match = existing_stub_helpers_contents.match(/import \{(.+)\}(\s+)from(.+)\;/g).pop();
    var import_insert_index = existing_stub_helpers_contents.indexOf(final_import_match);

    var existing_stub_helpers_contents_with_import = existing_stub_helpers_contents.substring(0, import_insert_index + final_import_match.length) +
        '\n' + rendered_include +
        existing_stub_helpers_contents.substring(import_insert_index + final_import_match.length)

    var first_insert_match = existing_stub_helpers_contents_with_import.match(/export const Data = \{/);
    var first_insert_match_index = first_insert_match.index;
    
    var existing_stub_helpers_contents_with_import_and_definition = existing_stub_helpers_contents_with_import.substring(0, first_insert_match_index + first_insert_match[0].length) +
        '\n  ' + rendered_definition +
        existing_stub_helpers_contents_with_import.substring(first_insert_match_index + first_insert_match[0].length);

    File.writeFileSync(`./src/helpers/helper.data.ts`, existing_stub_helpers_contents_with_import_and_definition);
  }
  
  _emit_data_stub_into_new() {
    this.fs.copyTpl(
      this.templatePath('./lambda/endpoint.data.ts.template'),
      this.destinationPath('./src/lambdas/' + this.choices.module_name + '/' + this.choices.endpoint_name + '/' + this.choices.endpoint_name + '.data.ts'),
      Object.assign(this.choices, this.viewHelpers)
    );
  }
  
  _emit_model_into_new() {
    this.fs.copyTpl(
      this.templatePath('./lambda/endpoint.model.ts.template'),
      this.destinationPath('./src/lambdas/' + this.choices.module_name + '/' + this.choices.endpoint_name + '/' + this.choices.endpoint_name + '.model.ts'),
      Object.assign(this.choices, this.viewHelpers)
    );
    
  }

  _emit_lambda_helper_and_definition_into_new() {
    this.fs.copyTpl(
      this.templatePath('./lambda/endpoint.ts.template'),
      this.destinationPath('./src/lambdas/' + this.choices.module_name + '/' + this.choices.endpoint_name + '/' + this.choices.endpoint_name + '.ts'),
      Object.assign(this.choices, this.viewHelpers)
    );
    
  }

  _emit_endpoint_data_definition_into_new() {
    var dataDefinitionContents = File.readFileSync(`./definitions/${this.viewHelpers.lowercase(this.choices.module_name)}/${this.choices.data_type_name}`);
    File.writeFileSync(`./src/lambdas/${this.choices.module_name}/${this.choices.endpoint_name}/${this.choices.endpoint_name}.d.ts`, dataDefinitionContents);
  }
  
  _emit_lambda_helper_and_definition_into_existing() {
    var existing_lambda_path = `./src/lambdas/${this.choices.module_name}/${this.choices.endpoint_name}/${this.choices.endpoint_name}.ts`;
    var existing_lambda_contents = File.readFileSync(existing_lambda_path, 'utf8');
    // Add new helper.route definition
    // Future: Do this with AST parsing/the ts lib
    // Present: Just look for a regex and insert our template after it
    var raw_helper_route_template = File.readFileSync(pathToModule + '/templates/lambda/helper-route.ts.template', 'utf8');
    var raw_helper_template = File.readFileSync(pathToModule + '/templates/lambda/helper-handler.ts.template', 'utf8');
    
    var rendered_helper_route = ejs.render(raw_helper_route_template, Object.assign(this.choices, this.viewHelpers));
    var rendered_helper = ejs.render(raw_helper_template, Object.assign(this.choices, this.viewHelpers));
    
    // Todo: Check if helper route is in conflict with existing
    // Get final helper definition
    var finalHelperRouteMatch = existing_lambda_contents.match(/helper.route(?![\s\S]*helper.route)/);
    
    // Insert the helper definition
    // Get end of helper definition statement
    var semicolon_match = existing_lambda_contents.substring(finalHelperRouteMatch.index).match(/(\;)/);
    
    // 1 is length of substr we are searching for
    var offset_to_insert_route_helper_definition = semicolon_match.index + finalHelperRouteMatch.index + 1;
    var existing_lambda_contents_with_helper_definition =
        existing_lambda_contents.substring(0, offset_to_insert_route_helper_definition) +
        "\n\n    " +
        rendered_helper_route +
        existing_lambda_contents.substring(offset_to_insert_route_helper_definition);
    
    // Insert the helper itself
    var end_of_handler_definition_match = existing_lambda_contents_with_helper_definition.substring(offset_to_insert_route_helper).match(/\},\n/);
    
    // 3 is length of substr we are searching for
    var offset_to_insert_route_helper = end_of_handler_definition_match.index + 3;
    var existing_lambda_contents_with_helper_definition_and_helper = existing_lambda_contents_with_helper_definition.substring(0, offset_to_insert_route_helper) +
        "\n\n  " +
        rendered_helper +
        "\n" +
        existing_lambda_contents_with_helper_definition.substring(offset_to_insert_route_helper);
  }

  _reloadServerlessConfig() {
    this.serverlessConfig = YAML.load('./serverless.yml');
  }
  
  _implemented_methods_for(module_name, endpoint_name) {
    var implemented_methods = [];
    for(var yamlEndpoint in this.serverlessConfig.functions) {
      var handler_pieces = this.serverlessConfig.functions[yamlEndpoint].handler.split('/');
      var yaml_module_name = handler_pieces[2];
      var yaml_endpoint_name = handler_pieces[3];

      if(yaml_module_name == module_name && yaml_endpoint_name == endpoint_name) {
        var events = this.serverlessConfig.functions[yamlEndpoint].events
        for(var event in events) {
          implemented_methods.push({name: events[event].http.method, path: events[event].http.path});
        }
        
      }
      
    }
    
    return implemented_methods;
  }
  
};
