"use strict";

const alert = require("./modules/alert");
const app = require('electron').app;
const electron = require("electron");
const fs = require("fs");
const ipcMain = require("electron").ipcMain;
const path = require("path");
const windows = require("./modules/windows");
const {save_prefs, read_prefs} = require("./modules/preferences");
const {sort_by} = require("./modules/utils");

let about_message = `Fluorine ${app.getVersion()} is a replay viewer for Halite 3\n--\n` +
	`Electron ${process.versions.electron} + Node ${process.versions.node} + Chrome ${process.versions.chrome} + V8 ${process.versions.v8}`;

// -------------------------------------------------------
// Preferences.

const prefs = read_prefs(app);
function set_pref(attrname, value) {
	if (!prefs.hasOwnProperty(attrname)) {
		throw new Error("Tried to set a prefence attr that wasn't defined: ", attrname);
	}
	prefs[attrname] = value;
	windows.send("renderer", "prefs_changed", prefs);
	save_prefs(app, prefs);
}


// -------------------------------------------------------


electron.app.on("ready", () => {

	let main = windows.new("renderer", {
		title: "Fluorine", show: false, width: 1150, height: 800, resizable: true, page: path.join(__dirname, "fluorine_renderer.html")
	});

	main.once("ready-to-show", () => {
		main.show();
	})

	windows.new("extra_stats", {
		title: "Extra Stats", show: false, width: 400, height: 800, resizable: true, page: path.join(__dirname, "fluorine_info.html")
	});

	windows.new("selector", {
		title: "Select Ship", show: false, width: 320, height: 100, resizable: true, page: path.join(__dirname, "fluorine_select.html")
	});

	windows.new("turn", {
		title: "Go To Turn", show: false, width: 320, height: 100, resizable: true, page: path.join(__dirname, "fluorine_turn.html")
	});

	electron.Menu.setApplicationMenu(make_main_menu());
});

electron.app.on("window-all-closed", () => {
	electron.app.quit();
});

// -------------------------------------------------------

ipcMain.on("renderer_ready", () => {

	// Load a file via command line with -o filename.

	let filename = "";
	for (let i = 0; i < process.argv.length - 1; i++) {
		if (process.argv[i] === "-o") {
			filename = process.argv[i + 1];
		}
	}
	if (filename !== "") {
		windows.send("renderer", "open", filename);
	}

	// Or, if exactly 1 arg, assume it's a filename.
	// Only good for standalone release.

	else if (process.argv.length === 2 && path.basename(process.argv[0]) !== "electron" && path.basename(process.argv[0]) !== "electron.exe") {
		if (process.argv[1] !== ".") {
			windows.send("renderer", "open", process.argv[1]);
		}
	}
	else {
		monitor_dirs(prefs.last_monitored_replay_dirs);
	}

});

ipcMain.on("relay", (event, msg) => {
	windows.send(msg.receiver, msg.channel, msg.content);		// Messages from one browser window to another...
});

ipcMain.on("show_window", (event, window_token) => {
	windows.show(window_token);
});

ipcMain.on("hide_window", (event, window_token) => {
	windows.hide(window_token);
});


// -------------------------------------------------------
// Replay dir monitoring.


let replay_dir_watchers = [];
function monitor_dirs(dirs) {
	dirs = dirs || [];

	for (const watcher of replay_dir_watchers) {
		watcher.close();
	}

	const is_replay_file = (filename) => filename.endsWith(".hlt");

	// Open the most recent replay file.
	if (dirs.length) {
		const get_replays = (dir) => {
			return fs.readdirSync(dirs[0])
				     .filter(is_replay_file)
				     .map(filename => path.join(dir, filename));
		}
		const replay_paths = [].concat(...dirs.map(get_replays));
		if (replay_paths.length) {
			const replay_path = sort_by(replay_paths,
				filepath => -fs.statSync(filepath).mtime.getTime()
			)[0];
			windows.send("renderer", "open", replay_path);
		}
	}

	// Start the new watchers.
	replay_dir_watchers = dirs.map(dir => fs.watch(
		dir,
		{persistent: false},
		(eventType, filename) => {
			if (eventType == "change" && is_replay_file(filename)) {
				windows.send("renderer", "open", path.join(dir, filename));
			}
		}
	));

	set_pref("last_monitored_replay_dirs", dirs);
}

// -------------------------------------------------------

function make_main_menu() {
	const template = [
		{
			label: "File",
			submenu: [
				{
					label: "Open...",
					accelerator: "CommandOrControl+O",
					click: () => {
						let files = electron.dialog.showOpenDialog();
						if (files && files.length > 0) {
							windows.send("renderer", "open", files[0]);
						}
					}
				},
				{
					label: "Monitor Replay Folder...",
					accelerator: "CommandOrControl+Shift+O",
					click: () => {
						// Note: Users can click "cancel" to stop monitoring files.
						monitor_dirs(electron.dialog.showOpenDialog({
							properties: ['openDirectory', 'multiSelections'],
						}));
					}
				},
				{
					type: "separator"
				},
				{
					label: "Open f-log...",
					click: () => {
						let files = electron.dialog.showOpenDialog();
						if (files && files.length > 0) {
							windows.send("renderer", "open_flog", files[0]);
						}
					}
				},
				{
					label: "What is an f-log?",
					click: () => {
						about_flogging();
					}
				},
				{
					type: "separator"
				},
				{
					label: "Save decompressed JSON",
					accelerator: "CommandOrControl+S",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save", outfilename);
						}
					}
				},
				{
					label: "Save current frame",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save_frame", outfilename);
						}
					}
				},
				{
					label: "Save current entities",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save_entities", outfilename);
						}
					}
				},
				{
					label: "Save upcoming moves",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save_moves", outfilename);
						}
					}
				},
				{
					label: "Save upcoming events",
					click: () => {
						let outfilename = electron.dialog.showSaveDialog();
						if (outfilename) {
							windows.send("renderer", "save_events", outfilename);
						}
					}
				},
				{
					type: "separator"
				},
				{
					accelerator: "CommandOrControl+Q",
					role: "quit"
				},
			]
		},
		{
			label: "Navigation",
			submenu: [
				{
					label: "Forward",
					accelerator: "Right",
					click: () => {
						windows.send("renderer", "forward", 1);
					}
				},
				{
					label: "Back",
					accelerator: "Left",
					click: () => {
						windows.send("renderer", "forward", -1);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Move to start",
					accelerator: "Home",
					click: () => {
						windows.send("renderer", "forward", -99999);
					}
				},
				{
					label: "Move to end",
					accelerator: "End",
					click: () => {
						windows.send("renderer", "forward", 99999);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Go to turn...",
					accelerator: "CommandOrControl+T",
					click: () => {
						windows.show("turn");
						windows.send("turn", "focus_input", null);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Previous collision",
					accelerator: "C",
					click: () => {
						windows.send("renderer", "previous_collision", null);
					}
				},
				{
					label: "Next collision",
					accelerator: "V",
					click: () => {
						windows.send("renderer", "next_collision", null);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Selected ship's fate",
					accelerator: "X",
					click: () => {
						windows.send("renderer", "ship_fate", null);
					}
				},
			]
		},
		{
			label: "View",
			submenu: [
				{
					label: "Integer box sizes",
					type: "checkbox",
					checked: prefs.integer_box_sizes,
					click: (menuItem) => {
						set_pref("integer_box_sizes", menuItem.checked);
					}
				},
				{
					label: "Turns start at 1",
					type: "checkbox",
					checked: prefs.turns_start_at_one,
					click: (menuItem) => {
						set_pref("turns_start_at_one", menuItem.checked);
					}
				},
				{
					label: "Grid",
					submenu: [
						{
							label: "0",
							type: "radio",
							accelerator: "F1",
							checked: prefs.grid_aesthetic === 0,
							click: () => {
								set_pref("grid_aesthetic", 0);
							}
						},
						{
							label: "halite / 4",
							type: "radio",
							accelerator: "F2",
							checked: prefs.grid_aesthetic === 1,
							click: () => {
								set_pref("grid_aesthetic", 1);
							}
						},
						{
							label: "255 * sqrt(halite / 2048)",
							type: "radio",
							accelerator: "F3",
							checked: prefs.grid_aesthetic === 2,
							click: () => {
								set_pref("grid_aesthetic", 2);
							}
						},
						{
							label: "255 * sqrt(halite / 1024)",
							type: "radio",
							accelerator: "F4",
							checked: prefs.grid_aesthetic === 3,
							click: () => {
								set_pref("grid_aesthetic", 3);
							}
						},
					]
				},
				{
					label: "Triangles",
					submenu: [
						{
							label: "Show next move",
							type: "radio",
							checked: prefs.triangles_show_next,
							click: () => {
								set_pref("triangles_show_next", true);
							}
						},
						{
							label: "Show previous move",
							type: "radio",
							checked: prefs.triangles_show_next === false,
							click: () => {
								set_pref("triangles_show_next", false);
							}
						}
					]
				},
				{
					type: "separator"
				},
				{
					label: "Up",
					accelerator: "W",
					click: () => {
						windows.send("renderer", "down", 1);
					}
				},
				{
					label: "Left",
					accelerator: "A",
					click: () => {
						windows.send("renderer", "right", 1);
					}
				},
				{
					label: "Down",
					accelerator: "S",
					click: () => {
						windows.send("renderer", "down", -1);
					}
				},
				{
					label: "Right",
					accelerator: "D",
					click: () => {
						windows.send("renderer", "right", -1);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Reset camera",
					accelerator: "R",
					click: () => {
						windows.send("renderer", "set", ["offset_x", 0]);
						windows.send("renderer", "set", ["offset_y", 0]);
					}
				},
				{
					label: "Clear selection",
					accelerator: "Escape",
					click: () => {
						windows.send("renderer", "set", ["selection", null]);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Select ship by ID...",
					accelerator: "CommandOrControl+F",
					click: () => {
						windows.show("selector");
						windows.send("selector", "focus_input", null);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Font smaller",
					accelerator: "CommandOrControl+-",
					role: "zoomout"
				},
				{
					label: "Font larger",
					accelerator: "CommandOrControl+=",
					role: "zoomin"
				},
				{
					label: "Reset font",
					role: "resetzoom"
				},
			]
		},
		{
			label: "Extra",
			submenu: [
				{
					label: "Extra stats",
					click: () => {
						windows.show("extra_stats");
					}
				},
				{
					type: "separator"
				},
				{
					label: "About Fluorine",
					click: () => {
						alert(about_message);
					}
				},
				{
					role: "toggledevtools"
				},
			]
		},
	];

	return electron.Menu.buildFromTemplate(template);
}

function about_flogging() {

	let s = `

An f-log is a JSON file with the following format:

  [
    {"t": 4, "x": 8, "y": 16, "msg": "Hello"},
    {"t": 12, "x": 8, "y": 15, "msg": "Hi again"}
  ]

When an f-log is loaded, if the Fluorine crosshairs are on a point \
with a message (i.e. at time t, coordinates x and y) then the given \
message will be displayed in the infobox. If the f-log has more than \
one message for a given [t,x,y] then all of them will be shown.

For t, you may consider turns as starting at 0 or 1. There is a menu \
item in the View menu for this. Make sure Fluorine is using the same \
system as your bot.

Also note that loading an f-log is not safe against malicious input.`;

	alert(s);
}
