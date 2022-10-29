// Made with ❤️ and ☕ in Colombia.

/**
 * Retrieve object from Chrome's Local StorageArea
 * @param {string} key 
 */
const getObjectFromLocalStorage = async function(key) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(key, function(value) {
        resolve(value[key]);
      });
    } catch (ex) {
      reject(ex);
    }
  });
};

/**
 * Save Object in Chrome's Local StorageArea
 * @param {*} obj 
 */
const saveObjectInLocalStorage = async function(obj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, function() {
        resolve();
      });
    } catch (ex) {
      reject(ex);
    }
  });
};

// Crypt from https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
function crypt(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed,
        h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

const debounce = (func, wait) => {
    let timeout;

    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };

        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

function decimalToHours(number) {
    var sign = (number >= 0) ? 1 : -1;
    number = number * sign;
    var hour = Math.floor(number);
    var decpart = number - hour;
    var min = 1 / 60;
    decpart = min * Math.round(decpart / min);
    var minute = Math.floor(decpart * 60) + '';
    if (minute.length < 2) {
        minute = '0' + minute;
    }
    sign = sign == 1 ? '' : '-';

    return sign + hour + ':' + minute;
}

function hoursToDecimal(t) {
    var arr = t.split(':');
    var dec = parseInt((arr[1]/6)*10, 10);

    return parseFloat(parseInt(arr[0], 10) + '.' + (dec<10?'0':'') + dec);
}

/** Events **/
function onDragOver(e) {
    e.preventDefault();
    if (e.target.classList.contains('tenup-resource')) {
        e.target.classList.add('tenup-resource--drag-here--active');
    }
}

function onDragLeave(e) {
    e.preventDefault();
    if (e.target.classList.contains('tenup-resource')) {
        e.target.classList.remove('tenup-resource--drag-here--active');
    }
}

function drag(e) {
    const zones = document.querySelectorAll('.tenup-resource');
    e.dataTransfer.setData('task_id', e.target.getAttribute('data-id'));
    zones.forEach(el => {
        el.classList.add('tenup-resource--drag-here');
    });
}

function dragEnd(e) {
    const zones = document.querySelectorAll('.tenup-resource');
    zones.forEach(el => {
        el.classList.remove('tenup-resource--drag-here');
        el.classList.remove('tenup-resource--drag-here--active');
    });
}

async function onDrop(e) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('task_id');
    const resourceId = e.target.getAttribute('data-id');
    document.querySelector('[data-id="'+taskId+'"]').remove();

    const relationships = JSON.parse(await getObjectFromLocalStorage('tenupRelationships') || "{}");

    if ( ! relationships[resourceId] ) {
        relationships[resourceId] = []
    }

    if ( relationships[resourceId].indexOf(taskId) === -1 ) {
        relationships[resourceId].push(taskId);
    }

	await saveObjectInLocalStorage( { tenupRelationships: JSON.stringify(relationships) } );

    buildResources();
};

async function resetItems(e) {
    e.preventDefault();
    const resourcing_id = e.target.parentElement.parentElement.getAttribute('data-id');
	const values = await getObjectFromLocalStorage('tenupRelationships');
    const relationships = JSON.parse(values || "{}");

    if ( relationships[resourcing_id] ) {
        relationships[resourcing_id] = [];
    }

    await saveObjectInLocalStorage( { tenupRelationships: JSON.stringify(relationships) } );
    buildResources();
    buildHarvestTasks();
}

function makeHtml(templateString) {
    const template = document.createElement('template');
    template.innerHTML = templateString;

    return template.content.firstElementChild;
}

function template() {
    const html = `
        <div id="tenup-resourcing">
            <div class="tenup-heading">Resourcing</div>
            <div id="tenup-resourcing-container"></div>
            <div id="tenup-unassigned-tasks"></div>
        </div>`;

    return makeHtml(html);
}

async function resourcingTemplate({resourcing_id, name, hours}) {
    const relationships = JSON.parse(await getObjectFromLocalStorage('tenupRelationships') || "{}");
    const items = relationships[resourcing_id] ? relationships[resourcing_id].length : 0;
    const totalHoursSpent = items > 0 ? (async () => {
        const harvestTime = await getHarvestWeekData(false);
        let hours = 0;
        relationships[resourcing_id].forEach(async task_id => {
            harvestTime.forEach(async (time, index) => {
                if (time.id === task_id) {
                    hours += hoursToDecimal(time.hours);
                }
            });
        });
        return decimalToHours(hours);
    })() : '0:00';
    const hoursRemaining = items > 0 ? (async () => {
        return decimalToHours( hoursToDecimal(hours) - hoursToDecimal(totalHoursSpent) );
    })() : hours;
    const progress = items > 0 ? (async () => {
        return ( hoursToDecimal(totalHoursSpent) / hoursToDecimal(hours) ) * 100;
    })() : 0;
    const templateString = `
    <div data-id="${resourcing_id}" class="tenup-resource">
      <div class="tenup-resource__controls">
        <div class="tenup-resource__tasks">${items}</div>
        <div class="tenup-resource__reset">reset items</div>
      </div>
      <div class="tenup-resource__title">${name}</div>
      <div class="tenup-resource__hours">
        <div class="tenup-resource__current-hours">${totalHoursSpent}</div>
        <div class="tenup-resource__total-hours">${hours}</div>
      </div>
      <div style="--width: ${progress}%;" class="tenup-resource__progress"></div>
      <div class="tenup-resource__hours-left">${hoursRemaining}</div>
    </div>
`;
    const html = makeHtml(templateString);
    html.ondrop = onDrop;
    html.ondragover = onDragOver;
    html.ondragleave = onDragLeave;
    html.querySelector('.tenup-resource__reset').onclick = resetItems;

    return html;
}

function taskTemplate({id, name, category}) {
    const templateString = `
     <div data-id="${id}" class="tenup-unassigned-task" draggable="true">
      <div class="tenup-unassigned-task__title">
        ${name}
      </div>
      <div class="tenup-unassigned-task__task">
        ${category}
      </div>
    </div>
    `;

    const html = makeHtml(templateString);
    html.ondragstart = drag;
    html.ondragend = dragEnd;

    return html;
}

function get10upResourcingData() {
    const projects = [];
    const $categories = document.querySelectorAll('.employee-schedule-row:not([class*=" "])');
    $categories.forEach(($category, index) => {
        projects[index] = {
            resourcing_id: crypt($category.querySelector('.employee-client-project').innerText),
            name: $category.querySelector('.employee-client-project').innerText,
            hours: decimalToHours(Number($category.querySelector('.employee-client-hours').innerText)),
        };
    });

    return projects;
}

async function getHarvestWeekData(filtered = true) {
    const projects = [];
    const $categories = document.querySelectorAll('.week-view-entry');
    const relationships = JSON.parse(await getObjectFromLocalStorage('tenupRelationships') || "{}");

    $categories.forEach(($category, index) => {
        const id = $category.getAttribute('data-project-id') + '/' + $category.getAttribute('data-task-id');
        for (const [key, value] of Object.entries(relationships)) {
            if ( value.indexOf(id) > -1 && filtered ) {
                return;
            }
        }
        projects[index] = {
            id,
            name: $category.querySelector('.entry-project').innerText,
            category: $category.querySelector('.entry-task').innerText,
            hours: $category.querySelector('.total').innerText,
        };
    });

    return projects;
}

async function storeResourcingData(when, what) {
	const obj = {};
	obj['res_'+when] = JSON.stringify(what);
	await saveObjectInLocalStorage(obj);
}

async function getResourcingData(when) {
    const resourcing = await getObjectFromLocalStorage('res_' + when) || "{}";
    return JSON.parse(resourcing);
}

function buildInterface() {
    document.querySelector('#weekly-timesheets-wrapper').append(template());
}

async function buildResources() {
    const container = document.querySelector('#tenup-resourcing-container');
    container.innerHTML = '';
    const date = document.querySelector('.day a.test-Monday').getAttribute('href').split('day/')[1].split('/');
    const intDate = new Date(date[0] + '-' + date[1] + '-' + date[2]);
    const resourcing = await getResourcingData(intDate.getTime() / 100000);
	if (resourcing) {
		resourcing.map(async resource => {
			container.append( await resourcingTemplate(resource) );
		});
	}
}

async function buildHarvestTasks() {
    const container = document.querySelector('#tenup-unassigned-tasks');
    container.innerHTML = '';
    const loggedTime = await getHarvestWeekData();
    loggedTime.map(task => {
        container.append(taskTemplate(task));
    });
}

async function harvestMutationCallback(mutationList, observer) {
    for (const mutation of mutationList) {
        if ( mutation.type === 'childList' && ( mutation.target.classList.contains('pds-inline-block') || mutation.target.classList.contains('total') ) ) {
            await buildResources();
        }
    }
};

chrome.extension.sendMessage({}, async function(response) {
	var readyStateCheckInterval = setInterval(async function() {
	if (document.readyState === "complete") {
		clearInterval(readyStateCheckInterval);

		if ( location.host !== '10up.harvestapp.com' && location.host !== 'dashboard.10up.com' ) {
			return;
		}

		if ( location.host === 'dashboard.10up.com' ) {
			const date = document.querySelector(".date-nav-button.button-previous").getAttribute('href').split('week=')[1];
			const parsedDate = new Date(date);
			parsedDate.setDate(parsedDate.getDate() + 7);
			const weekInt = Math.floor( parsedDate.getTime() / 100000 );
			const resourcing = get10upResourcingData();
			await storeResourcingData(weekInt, resourcing);
		}

		if ( location.host === '10up.harvestapp.com' ) {
			buildInterface();
			await buildResources();
			await buildHarvestTasks();

			const targetNode = document.getElementById('weekly-timesheets-wrapper');
			const config = { attributes: true, childList: true, subtree: true };
			const observer = new MutationObserver(harvestMutationCallback);

			setTimeout(() => {
				observer.observe(targetNode, config);
			}, 3000);
		}

	}
	}, 10);
});
