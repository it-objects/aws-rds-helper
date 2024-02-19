const { exec, execSync } = require("child_process");
const { stdout, stderr } = require("process");
const inputReader = require('wait-console-input');
const fs = require('fs');
var inquirer = require('inquirer');
const homedir = require('os').homedir();
var final_profile;
var instance_availability_zone;

// Auswahl des Modus
async function select_mode() {
  return new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          type: 'checkbox',
          name: 'mode',
          message: 'Select task',
          choices: [
            'Connect via preset', 'Create new preset', 'One time connection',
          ],
        },
      ])
      .then(answers => {
        console.info('Answer:', answers.mode);
        resolve(answers.mode)
      });
  }
  )
}

// Auswahl des Profil
const profiles = execSync("aws configure list-profiles");
const parsed_profiles = profiles.toString().split("\n");
const profiles_array = [];

for (var x = 0; x < parsed_profiles.length; x++) {
  if (parsed_profiles[x] != "") {
    profiles_array[x] = parsed_profiles[x];
  }
}

async function select_profile() {
  return new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          type: "list",
          message: "Please choose profile from list:",
          name: "Profiles",
          choices: profiles_array
        }
      ])
      .then((answers) => {
        final_profile = answers.Profiles;
        console.log("export AWS_PROFILE=" + answers.Profiles);
        execSync("export AWS_PROFILE=" + answers.Profiles);
        process.env.AWS_PROFILE = answers.Profiles;
        resolve(final_profile)
      }, reject)
      .catch((error) => {
        if (error.isTtyError) {
          // Prompt couldn't be rendered in the current environment
        } else {
          // Something else went wrong
        }
      });
  })
}

//SSO LOGIN
async function check_login(aws_profile) {
  return new Promise((resolve, reject) => {

    try {
      execSync("aws sts get-caller-identity --profile " + aws_profile);
      console.log("You are already signed in");
      resolve(true);
    } catch (err) {
      console.log("sso");
      console.log("aws configure get " + aws_profile + ".sso_start_url");
      execSync("aws sso login");
      resolve(true);
    }
  });
}

//CHECK SSH-KEY
async function check_sshkey() {
  return new Promise((resolve, reject) => {

    const dir = homedir + "/clitool";

    // check if directory exists
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.error(err);
    }
    var dirContent = fs.readdirSync(dir).filter(x => x.indexOf('.pub') > -1);
    if (dirContent[0] == undefined) {
      console.log("no ssh key found. Generating a new ssh key.");
      console.log("file://" + dir + "/id_rsa.pub");
      execSync("ssh-keygen -f " + dir + "/id_rsa -t rsa -N ''");
      resolve("file://" + dir + "/id_rsa.pub");
    }
    else {
      console.log("Found ssh key in root folder")
      resolve("file://" + dir + "/id_rsa.pub");
    }
  })
}

// Auswahl des Datenbank Instanz
async function select_db() {
  return new Promise((resolve, reject) => {
    var ausgabe = execSync("aws rds describe-db-instances")
    const db_parsed_result = JSON.parse(ausgabe.toString());
    const db_instances_array = [];
    const db_id = [];
    const db_endpoint_address = [];
    const db_endpoint_port = [];
    const db_availabilityzone = [];

    for (var x = 0; x < db_parsed_result.DBInstances.length; x++) {
      db_instances_array[x] = db_parsed_result.DBInstances[x].Endpoint.Address + ":" + db_parsed_result.DBInstances[x].Endpoint.Port
    }
    inquirer
      .prompt([
        {
          type: "list",
          message: "Please choose db instance from list:",
          name: "Database",
          choices: db_instances_array
        }
      ])
      .then((answers) => {
        resolve(answers.Database);
      }, reject)
      .catch((error) => {
        if (error.isTtyError) {
          // Prompt couldn't be rendered in the current environment
        } else {
          // Something else went wrong
        }
      });
    ;
  });
}

// Auswahl des Datenbankport
async function select_local_db_port() {
  return new Promise((resolve, reject) => {
    inquirer
      .prompt([
        {
          name: 'localDBPort',
          message: 'Enter local db port:',
          default: '3306'
        },
      ])
      .then(answers => {
        resolve(answers.localDBPort);
      });
    ;
  });
}

// Auswahl des Bastion Servers
async function select_instance() {
  return new Promise((resolve, reject) => {


    var ausgabe = execSync("aws ec2 describe-instances")
    const parsed_result = JSON.parse(ausgabe.toString());
    const instances_array = [];
    const choices_array = [];
    const availability_zone = [];

    for (var x = 0; x < parsed_result.Reservations.length; x++) {
      var options = [];
      var row = parsed_result.Reservations[x].Instances[0];
      options.push(row.InstanceId);
      options.push(row.State.Name);
      var tag = row.Tags.find(tag => tag.Key == 'Name');
      if (tag) {
        options.push(tag.Value);
      }
      choices_array[x] = options.join("  |   ");

    }

    inquirer
      .prompt([
        {
          type: "list",
          message: "Please choose bastion server from list:",
          name: "Instance",
          choices: choices_array
        }
      ])
      .then((answers) => {

        for (var x = 0; x < parsed_result.Reservations.length; x++) {
          if (parsed_result.Reservations[x].Instances[0].InstanceId == answers.Instance.slice(0, 19)) {
            instance_availability_zone = parsed_result.Reservations[x].Instances[0].Placement.AvailabilityZone;
          }
          else { }
        }
        resolve(answers.Instance.slice(0, 19));
      }, reject)
      .catch((error) => {
        if (error.isTtyError) {
          // Prompt couldn't be rendered in the current environment
        } else {
          // Something else went wrong
        }
      });

    ;

  });
}


async function load_profile() {
  const dir = homedir + "/clitool";
  var dirContent = fs.readdirSync(dir).filter(x => x.indexOf('.json') > -1);

  var database;
  var localDBPort;
  var instance;
  var instance_availability_zone;
  var aws_profile;

  inquirer
    .prompt([
      {
        type: 'list',
        name: 'loaded_profile',
        message: 'which profile?',
        choices: dirContent,
      },
    ])
    .then(answers => {
      console.info('Answer:', answers.loaded_profile);

      var fileContent = fs.readFileSync(dir + '/' + answers.loaded_profile, 'utf-8');
      var jsonObject = JSON.parse(fileContent.toString());


      database = jsonObject.database;
      localDBPort = jsonObject.localDBPort;
      instance = jsonObject.instance;
      instance_availability_zone = jsonObject.instance_availability_zone;
      aws_profile = jsonObject.aws_profile;

      connect_profile(aws_profile, database, localDBPort, instance, instance_availability_zone);
    })
}



async function choose_preset_name(){
  return new Promise((resolve, reject) => {

  inquirer
    .prompt([
      {
        name: 'presetName',
        message: 'Enter preset name:'
      },
    ])
    .then(answers => {
      console.info('Answer:', answers.presetName);
      resolve(answers.presetName);
    });



})
}

async function create_profile() {

  const dir = homedir + "/clitool";
  // check if directory exists

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error(err);
  }

  var final_profile = await select_profile();
  console.log(final_profile);
  var logged_in = await check_login(final_profile);

  if (logged_in == true) {
    var database = await select_db();
    var localDBPort = await select_local_db_port();
    var instance = await select_instance();
    var sshkey = await check_sshkey();
    var sshkey2 = sshkey.substring(7);
    sshkey2 = sshkey2.slice(0, -4);


    const profile = {
      instance: instance,
      database: database,
      localDBPort: localDBPort,
      instance_availability_zone: instance_availability_zone,
      aws_profile: final_profile
    }

    var presetName = await choose_preset_name();



    fs.writeFileSync(dir + '/' +presetName+ ".json", JSON.stringify(profile, null, 4));


    console.log("\n" + "Selected DB: " + database);
    console.log("Selected Local DB Port: " + localDBPort);
    console.log("Selected Bastion Server: " + instance + "\n");
    console.log("Selected SSH-Key: " + sshkey + "\n");

    try {
      const stdout = execSync("aws ec2-instance-connect send-ssh-public-key --instance-id " + instance + " --instance-os-user ssm-user --ssh-public-key " + sshkey + " --availability-zone " + instance_availability_zone);
      console.log('stdout: ' + stdout); // 'stdout: Hello\n'
      const stdout2 = execSync("ssh -o StrictHostKeyChecking=no -o ProxyCommand=\"aws ssm start-session --target " + instance + " --document-name AWS-StartSSHSession\" -i " + sshkey2 + " ssm-user@" + instance + " -NL " + localDBPort + ":" + database);
      console.log('stdout: ' + stdout2); // 'stdout: Hello\n'

    } catch (err) {
      console.error('Error: ' + err.toString());
    }
  }
}



//Mainfunction
async function awsrdshelper() {

  var awsrdshelper = await select_mode();


  if (mode == "Connect via preset") {
    load_profile();
  }
  else if (mode == "Create new preset") {
    create_profile();

  }
  else { connect_once() }
}


awsrdshelper();


async function connect_once() {

  var final_profile = await select_profile();
  console.log(final_profile);
  var logged_in = await check_login(final_profile);

  if (logged_in == true) {
    var database = await select_db();
    var localDBPort = await select_local_db_port();
    var instance = await select_instance();
    var sshkey = await check_sshkey();
    var sshkey2 = sshkey.substring(7);
    sshkey2 = sshkey2.slice(0, -4);

    console.log("\n" + "Selected DB: " + database);
    console.log("Selected Local DB Port: " + localDBPort);
    console.log("Selected Bastion Server: " + instance + "\n");
    console.log("Selected SSH-Key: " + sshkey + "\n");

    try {
      const stdout = execSync("aws ec2-instance-connect send-ssh-public-key --instance-id " + instance + " --instance-os-user ssm-user --ssh-public-key " + sshkey + " --availability-zone " + instance_availability_zone);
      console.log('stdout: ' + stdout); // 'stdout: Hello\n'
      console.log("Connection established! To close connection press CTRL+C");
      const stdout2 = execSync("ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -o ProxyCommand=\"aws ssm start-session --target " + instance + " --document-name AWS-StartSSHSession\" -i " + sshkey2 + " ssm-user@" + instance + " -NL " + localDBPort + ":" + database);
      console.log('stdout: ' + stdout2); // 'stdout: Hello\n'

    } catch (err) {
      console.error('Error: ' + err.toString());
    }
  }
}

async function connect_profile(final_profile, database, localDBPort, instance, instance_availability_zone) {
  process.env.AWS_PROFILE = final_profile;
  var logged_in = await check_login(final_profile);

  if (logged_in == true) {
    var database = database;
    var localDBPort = localDBPort;
    var instance = instance;
    var sshkey = await check_sshkey();
    var sshkey2 = sshkey.substring(7);
    sshkey2 = sshkey2.slice(0, -4);

    console.log("\n" + "Selected DB: " + database);
    console.log("Selected Local DB Port: " + localDBPort);
    console.log("Selected Bastion Server: " + instance);
    console.log("Selected SSH-Key: " + sshkey + "\n");

    try {
      const stdout = execSync("aws ec2-instance-connect send-ssh-public-key --instance-id " + instance + " --instance-os-user ssm-user --ssh-public-key " + sshkey + " --availability-zone " + instance_availability_zone);
      console.log('stdout: ' + stdout); // 'stdout: Hello\n'
      console.log("Connection established! To close connection press CTRL+C");
      const stdout2 = execSync("ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -o ProxyCommand=\"aws ssm start-session --target " + instance + " --document-name AWS-StartSSHSession\" -i " + sshkey2 + " ssm-user@" + instance + " -NL " + localDBPort + ":" + database);
      console.log('stdout: ' + stdout2); // 'stdout: Hello\n'

    } catch (err) {
      console.error('Error: ' + err.toString());
    }
  }
}
