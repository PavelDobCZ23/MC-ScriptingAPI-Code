import {world} from "mojang-minecraft";

class CommandParser {
    constructor(options = {prefix: 'i.', caseSensitive: true}) {
        this.#options = options;
        world.events.beforeChat.subscribe((eventData) => {
            const {message, sender} = eventData;

            if (message.startsWith(this.#options.prefix)) {
                eventData.cancel = true;
                const messageArray = message.split(' ');
                let commandInput = messageArray[0].slice(this.#options.prefix.length);
                if (!this.#options.caseSensitive) {
                    commandInput = commandInput.toLowerCase();
                }

                let command;
                for (const commandName in this.#commands) {
                    if (commandName === commandInput || this.#commands[commandName].aliases?.includes(commandInput)) {
                        command = this.#commands[commandName];
                    }
                }
        
                //Command execution
                try {
                    if (!command) {
                        throw new CommandError(`§cCommand §r§l'${commandInput}'§r§c not found!`);
                    }
                    if (command.senderCheck && !command.senderCheck(sender)) {
                        throw new CommandError(`§cYou do not meet requirements to use the command §r§l'${commandInput}'§r§c!`);
                    }
                    const parameters = this.#getParameters(messageArray,command.parameters);
                    command.run(sender, parameters);
                } catch (error) {
                    if (error instanceof CommandError) {
                        sendMessage(error.message,'CMD',sender);
                    } else {
                        sendMessage(`§cFatal error has occured during the execution of §r§l'${commandInput}'§r§c!`,'CMD',sender);
                    }
                }
            }
        });

        /*this.registerCommand('help',{
            aliases: ['?'],
            parameters: [],
            run(sender) {
                sendMessage('Test','CMD',sender);
            }
        });*/
    }

    /** 
     * @param {string} name - Identification of the command.
     * @param {object} definition - Definitions for the behavior of the command.
     * @param {string[]} [definition.aliases] - Aliases to invoke the command. Repeating the same aliases might have unexpected results.
     * @param {object[]} definition.parameters - All parameters that the command takes.
     * @param {Function} [definition.senderCheck] - Optional function that needs to return `true` in order to allow execution of the command, it gets passed a `sender{Player}` parameter.
     * @param {Function} definition.run - Function that runs when the command is invoked, it gets passed 2 parameters, `sender{Player}` and `parameters{Object}` containing all parsed parameters.
     **/
    registerCommand(name,definition) {
        if(!this.#options.caseSensitive) {
            name = name.toLowerCase();
        }
        this.#commands[name] = definition;
    }

    #commands = {}
    #options = {
        prefix: 'i.',
        caseSensitive: true
    }

    #getParameters(messageArray,options) {
        messageArray = messageArray.slice(1);
        const parameters = [];
        let quotedParameters = [];
        for (const item of messageArray) {
            //Multiple spaces:
            if (item === '' && quotedParameters.length === 0) {
                continue
            } else if (item === '' && quotedParameters.length !== 0) {
                quotedParameters.push('');
                continue
            }
            //Solo Quote
            if (item === '\"' && quotedParameters.length === 0) {
                quotedParameters.push('');
                continue
            } else if (item === '\"' && quotedParameters.length !== 0) {
                quotedParameters.push('');
                parameters.push(quotedParameters.join(' '));
                quotedParameters.length = 0;
                continue
            }
            //Quote w/out space
            if (item.endsWith('\"') && item.startsWith('\"')) {
                parameters.push(item.slice(1,-1));
                continue
            }
            //Parameters
            if (item.endsWith('\"') && !item.startsWith('\"') && quotedParameters.length !== 0 && item.charAt(item.length - 2) !== '\\') {
                quotedParameters.push(item.slice(0,-1));
                parameters.push(quotedParameters.join(' '));
                quotedParameters.length = 0;
            } else if (item.startsWith('\"') && !item.endsWith('\"') && quotedParameters.length === 0) {
                quotedParameters.push(item.slice(1));
            } else if (quotedParameters.length !== 0) {
                quotedParameters.push(item);
            } else {
                parameters.push(item);
            }
        }
        
        return this.#getParameterChain(parameters,options);
    }

    #getParameterChain(parameters,options,index = 0,optional = false) {
        let output = {};

        for (const option of options) {
            const parameter = parameters[index];

            if (option.optional) {
                optional = true;
            }

            if (index >= parameters.length) {
                if (optional) {
                    return output;
                } else {
                    throw new CommandError(`Missing parameter '${option.id}'!`);
                }
            }

            const parsedParameter = this.#parseParameterType(parameter,option);

            if (option.array) {
                let parameterArray = [];
                if (parameters.length < index + option.array) {
                    throw new CommandError(`Incomplete array parameter '${option.id}'!`);
                }
                for (const arrayParameter of parameters.slice(index,index += option.array)) {
                    const parsedArrayParameter = this.#parseParameterType(arrayParameter,option);
                    parameterArray.push(parsedArrayParameter);
                }
                output[option.id] = parameterArray;
            } else if (option.choice) {
                output[option.id] = parsedParameter;
                if (!(parameter in option.choice)) {
                    throw new CommandError(`Invalid choice of '${parameter}' at ${option.id}!`);
                }
                const choiceOutput = this.#getParameterChain(parameters.slice(index+1),option.choice[parameter],0,optional);
                Object.assign(output,choiceOutput);
            } else {
                output[option.id] = parsedParameter;
                index++;
            }

            const paramaterFormat = this.#getParameterFormat(option);

            switch (paramaterFormat) {
                case 'basic':
                    output[option.id] = parsedParameter;
                    index++;
                    break;
                case 'array':
                    let parameterArray = [];
                    if (parameters.length < index + option.array) {
                        throw new CommandError(`Incomplete array parameter '${option.id}'!`);
                    }
                    for (const arrayParameter of parameters.slice(index,index += option.array)) {
                        const parsedArrayParameter = this.#parseParameterType(arrayParameter,option);
                        parameterArray.push(parsedArrayParameter);
                    }
                    output[option.id] = parameterArray;
                    break;
                case 'choice':
                    output[option.id] = parsedParameter;
                    if (!(parameter in option.choice)) {
                        throw new CommandError(`Invalid choice of '${parameter}' at ${option.id}!`);
                    }
                    const choiceOutput = this.#getParameterChain(parameters.slice(index+1),option.choice[parameter],0,optional);
                    Object.assign(output,choiceOutput);
                    break;
            }
        }

        return output
    }

    #parseParameterType(parameter,option) {
        let parsedParameter, value;

        switch (option.type) {
            case 'string':
                value = parameter;
                parsedParameter = value;
                break
            case 'integer':
                value = parseInt(parameter);
                if (!isNaN(value)) {
                    parsedParameter = value;
                } else {
                    throw new CommandError(`Parameter '${option.id}' couldn't be parsed as integer number!`);
                }
                break
            case 'float':
                value = parseFloat(parameter);
                if (!isNaN(value)) {
                    parsedParameter = value;
                } else {
                    throw new CommandError(`Parameter '${option.id}' couldn't be parsed as floating-point number!`);
                }
                break
            case 'boolean':
                value = parameter.toLowerCase();
                if (value === 'true') {
                    parsedParameter = true;
                } else if (value === 'false') {
                    parsedParameter = false;
                } else {
                    throw new CommandError(`Parameter '${option.id}' couldn't be parsed as boolean value!`);
                }
                break
            default:
                throw new Error(`Unknown type of '${option.type}' found while parsing parameters!`);
        }
        return parsedParameter;
    }

    #getParameterFormat(option) {
        let format = 'basic';
        if (option.array) format = 'array';
        if (option.choice) format = 'choice';
        return format
    }
}

class CommandError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CommandError';
    }
}

/**
 * 
 * @param {string} message 
 * @param {string} sender 
 * @param {Player | Player[]} actor 
 */
 function sendMessage(message,sender,actor) {
    const messageText = !sender ? message : `[${sender}§r] ${message}`
    if (!actor) {
        world.say(messageText);
    } else {
        if (!Array.isArray(actor)) actor = [actor];
        for (const player of actor) {
            player.tell(messageText);
        }
    }
}

export {CommandParser}