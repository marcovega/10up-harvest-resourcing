// ==UserScript==
// @name         10up Live Resourcing
// @namespace    https://10up.com/
// @version      0.1
// @description  making resourcing timelogging easier for devs
// @author       Marco Vega
// @match        https://10up.harvestapp.com/time/week*
// @match        https://dashboard.10up.com/blog/10upper*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=10up.com
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// Made with ❤️ and ☕ in Colombia.

function css() {
    return '#tenup-resourcing-container,.tenup-heading{border-bottom:1px solid #f9f9f9}.tenup-heading,.tenup-unassigned-task__title{font-weight:700}#tenup-resourcing{margin-left:2rem;width:250px;margin-top:51px;border:1px solid #f8f8f8}#weekly-timesheets-wrapper,.tenup-resource__hours{display:flex}.tenup-heading{padding:10px 10px 10px 48px;background-image:url("https://10up.com/wp-content/themes/10up-sept2016/dist/img/10up-logo-full.svg");background-size:26px;background-repeat:no-repeat;background-color:#303030;color:#fff;background-position:10px center}.tenup-resource{padding:10px;background:#f9f9f9;margin:10px;border-radius:4px;border:2px dashed transparent}.tenup-resource__current-hours::after{content:" hours of ";margin-right:4px}.tenup-resource__progress{height:4px;background:#eee;margin:10px 0 3px;border-radius:4px;position:relative}.tenup-resource__progress::after{content:"";position:absolute;top:0;left:0;height:4px;width:var(--width);background-color:red;border-radius:4px}.tenup-resource__title{font-weight:700;margin-bottom:5px}.tenup-resource__hours-left{text-align:center;font-size:12px}.tenup-resource__hours-left::after{content:" hours left"}.tenup-unassigned-task{padding:10px 10px 10px 30px;background:#f9f9f9;margin:10px;border-radius:4px;position:relative;font-size:12px;cursor:grab}.tenup-unassigned-task:active{cursor:grabbing}.tenup-unassigned-task::after,.tenup-unassigned-task::before{content:"";position:absolute;width:2px;height:20px;background:#ddd;left:10px;top:50%;margin-top:-10px}.tenup-unassigned-task::after{left:14px}.tenup-unassigned-task:hover{background:#eee}.tenup-resource__controls{font-size:11px;display:flex;justify-content:space-between;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:4px}.tenup-resource__reset{cursor:pointer}.tenup-resource__tasks::after{content:" harvest items"}.tenup-resource--drag-here{position:relative;border:2px dashed #ccc}.tenup-resource--drag-here::after{content:"";position:absolute;z-index:999;top:0;left:0;right:0;bottom:0}.tenup-resource--drag-here--active{border:2px dashed red}.tenup-resource--drag-here>*{opacity:.3}';
}

/** Helper Functions **/
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

function onDrop(e) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('task_id');
    const resourceId = e.target.getAttribute('data-id');
    document.querySelector('[data-id="'+taskId+'"]').remove();

    const relationships = JSON.parse(GM_getValue('tenupRelationships') || "{}");

    if ( ! relationships[resourceId] ) {
        relationships[resourceId] = []
    }

    if ( relationships[resourceId].indexOf(taskId) === -1 ) {
        relationships[resourceId].push(taskId);
    }

    GM_setValue('tenupRelationships', JSON.stringify(relationships));

    buildResources();
};

function resetItems(e) {
    e.preventDefault();
    const resourcing_id = e.target.parentElement.parentElement.getAttribute('data-id');
    const relationships = JSON.parse(GM_getValue('tenupRelationships') || "{}");

    if ( relationships[resourcing_id] ) {
        relationships[resourcing_id] = [];
    }

    GM_setValue('tenupRelationships', JSON.stringify(relationships));
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

function resourcingTemplate({resourcing_id, name, hours}) {
    const relationships = JSON.parse(GM_getValue('tenupRelationships') || "{}");
    const items = relationships[resourcing_id] ? relationships[resourcing_id].length : 0;
    const totalHoursSpent = items > 0 ? (() => {
        const harvestTime = getHarvestWeekData(false);
        let hours = 0;
        relationships[resourcing_id].forEach(task_id => {
            harvestTime.forEach((time, index) => {
                if (time.id === task_id) {
                    hours += hoursToDecimal(time.hours);
                }
            });
        });
        return decimalToHours(hours);
    })() : '0:00';
    const hoursRemaining = items > 0 ? (() => {
        return decimalToHours( hoursToDecimal(hours) - hoursToDecimal(totalHoursSpent) );
    })() : hours;
    const progress = items > 0 ? (() => {
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

function getHarvestWeekData(filtered = true) {
    const projects = [];
    const $categories = document.querySelectorAll('.week-view-entry');
    const relationships = JSON.parse(GM_getValue('tenupRelationships') || "{}");

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

function storeResourcingData(when, what) {
    GM_setValue('resourcing-' + when, JSON.stringify(what));
}

function getResourcingData(when) {
    const resourcing = GM_getValue('resourcing-' + when) || "[]";
    return JSON.parse(resourcing);
}

function buildInterface() {
    document.querySelector('#weekly-timesheets-wrapper').append(template());
}

function buildResources() {
    const container = document.querySelector('#tenup-resourcing-container');
    container.innerHTML = '';
    const date = document.querySelector('h1[class*="test-week-"]').getAttribute('class').split(' ')[0].split('-')[2];
    const intDate = Date.parse(date.substring(0, 4) + '/' + date.substring(4, 6) + '/' + date.substring(6, 8));
    const resourcing = getResourcingData(intDate / 100000);
    const elements = resourcing.map(resource => {
        container.append( resourcingTemplate(resource) );
    });
}

function buildHarvestTasks() {
    const container = document.querySelector('#tenup-unassigned-tasks');
    container.innerHTML = '';
    const loggedTime = getHarvestWeekData();
    const elements = loggedTime.map(task => {
        container.append(taskTemplate(task));
    });
}

function harvestMutationCallback(mutationList, observer) {
    for (const mutation of mutationList) {
        if ( mutation.type === 'childList' && ( mutation.target.classList.contains('pds-inline-block') || mutation.target.classList.contains('total') ) ) {
            buildResources();
        }
    }
};

function insertCSS() {
    const wrapper = document.createElement('style');
    wrapper.innerHTML = css();
    document.querySelector('body').append(wrapper);
}

(function() {
    'use strict';

    if ( location.host !== '10up.harvestapp.com' && location.host !== 'dashboard.10up.com' ) {
        return;
    }

    if ( location.host === 'dashboard.10up.com' ) {
        const date = document.querySelector(".employee-nav-toolbar .button-week").innerText.replace('Week of ', '');
        const parsedDate = new Date.parse(date);
        const weekInt = Math.floor( parsedDate.getTime() / 100000 );
        const resourcing = get10upResourcingData();
        storeResourcingData(weekInt, resourcing);
    }

    if ( location.host === '10up.harvestapp.com' ) {
        insertCSS();
        buildInterface();
        buildResources();
        buildHarvestTasks();

        const targetNode = document.getElementById('weekly-timesheets-wrapper');
        const config = { attributes: true, childList: true, subtree: true };
        const observer = new MutationObserver(harvestMutationCallback);

        setTimeout(() => {
            observer.observe(targetNode, config);
        }, 3000);
    }
})();
