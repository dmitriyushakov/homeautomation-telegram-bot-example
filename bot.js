const TelegramBot = require('node-telegram-bot-api');

// Введите сюда свой токен, который получите от BotFather 

const token = '123456789:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const got = require('got');
const bot = new TelegramBot(token,
	{
		polling: true,
		request: {
			// Укажите адрес прокси сервера здесь.
			proxy: "http://xxx.xxx.xxx.xxx:xxx"
		}
	}
);

var mqtt = require('mqtt');

// Введите свои настройки подключения к MQTT брокеру. В данном случае используется локальный инстанс Mosquitto.

var client  = mqtt.connect('mqtt://localhost:1883',{
	"username":"username",
	"clientId":"telegram_bot"
});

// Добавьте в переменную 'authorizedUsersId' ID пользователей Telegram, которые будут использовать этот бот.
//
// Например:
// var authorizedUsersId=[1234,1235];

var authorizedUsersId=[];

// Введите свой список MQTT устройств. В данном случае названия и значения топиков приведены так, как они могли бы быть в прошивке Tasmota.
var mqttSwitchDevices = {
	"device1":{
		"commandTopic":"cmnd/device1/POWER",
		"resultTopic":"stat/device1/POWER",
		"onStatus":"ON",
		"offStatus":"OFF"
	},
	"device2":{
		"commandTopic":"cmnd/device2/POWER",
		"resultTopic":"stat/device2/POWER",
		"onStatus":"ON",
		"offStatus":"OFF"
	}
}

client.on("connect",function(){
	for(var key in mqttSwitchDevices){
		client.subscribe(mqttSwitchDevices[key].resultTopic);
	}
});

client.on("message",function(topic,message){
	var topicStr=topic.toString();
	for(var key in mqttSwitchDevices){
		var mqttSwitchDevice=mqttSwitchDevices[key];
		if(mqttSwitchDevice.resultTopic==topicStr){
			mqttSwitchDevice.state=message.toString();
		}
	}
});

function isAuthorized(userId){
	for(var i=0;i<authorizedUsersId.length;i++){
		if(authorizedUsersId[i]==userId)return true;
	}
	return false;
}
 
bot.on('message', (msg) => {
	const chatId = msg.chat.id;
	
	if(!isAuthorized(msg.from.id)){
		bot.sendMessage(chatId, 'You are not authorized! Please insert into authorizedUsersId "'+msg.from.id+'" value.');
		return;
	}else if(msg.text){
		var strings=msg.text.toLowerCase().split(' ');
		
		var commandName=strings[0];
		
		if((commandName == "/on" | commandName == "/off") && strings.length==2){
			var deviceName=strings[1];
			var mqttSwitchDevice=mqttSwitchDevices[deviceName];
			
			if(mqttSwitchDevice){
				client.publish(mqttSwitchDevice.commandTopic,commandName=="/on"?mqttSwitchDevice.onStatus:mqttSwitchDevice.offStatus);
				bot.sendMessage(chatId, 'Command received');
				return;
			}
			
			bot.sendMessage(chatId, 'Unknown device');
			return;
		}
		
		if(commandName == "/weather" && strings.length==1){
			(async () => {
				try {
					// Приведенная ниже процедура делает REST API вызов к локальному инстансу OpenHAB, с целью получения сведений о погоде.
					// Названия item'ов захордкожены и соответствуют моей конфигурации сервера OpenHAB.
					// В ваших условиях данная команда может потребовать изменений или удаления.
					
					const response = await got('http://localhost:8080/rest/items');
					var items = JSON.parse(response.body);
					
					var temperature=null;
					var pressure=null;
					var humidity=null;
					var light=null;
					
					for(var i=0;i<items.length;i++){
						var item=items[i];
						
						switch(item.name){
							case "Outdoor_Weather_Temperature":temperature=item.state;break;
							case "Outdoor_Weather_Pressure":pressure=item.state;break;
							case "Outdoor_Weather_Humidity":humidity=item.state;break;
							case "Outdoor_Weather_Light":light=item.state;break;
						}
					}
					
					bot.sendMessage(chatId,"Temperature: "+temperature+"\nPressure: "+pressure+"\nHumidity: "+humidity+"\nLight: "+light);
				} catch (error) {
					console.log(error.response.body);
				}
			})();
			return;
		}
		
		if(commandName == "/status" && strings.length==1){
			var firstLine=true;
			var resultMessage=null;
			for(var key in mqttSwitchDevices){
				var mqttSwitchDevice=mqttSwitchDevices[key];
				var msgString=key+": "+(mqttSwitchDevice.state==mqttSwitchDevice.onStatus?"On":(mqttSwitchDevice.state==mqttSwitchDevice.offStatus?"Off":mqttSwitchDevice.state));
				if(firstLine){
					resultMessage=msgString;
					firstLine=false;
				}else{
					resultMessage+="\n"+msgString;
				}
			}
			
			bot.sendMessage(chatId,resultMessage);
			return;
		}
	}
	
	bot.sendMessage(chatId, 'Message not recognized');
});