// insert personal mapbox token -- currently using mine (Kelly) but will need to be updated by a company-wide account or something
// maybe there's one designated person or account managed by USI that has a token for running the map 
mapboxgl.accessToken = 'pk.eyJ1IjoidXJiYW5zdHJhdGVnaWVzY29tIiwiYSI6InljWUI3bjgifQ.7FnHhzEC3LnGKjzYaYSZ1A'

// create a new map variable constant
const map = new mapboxgl.Map({
    // container for adding into the index.html page
    container: 'map',
    // set projection (CRS) for web map
    projection: 'mercator',
    // style code sets the base map -- current just streets, no polygons
    // can change style to no polygon on Toronto
    style: 'mapbox://styles/urbanstrategiescom/cmmw86cyz004s01s65q2lgak3',
    // center of the map -- this is the centerpoint of the desired location
    // might change to world map, so will need to change this set of coordinates too
    center: [-79.357577, 43.721446],
    // zoom level appropriate for Toronto, but will need to revert to 1 or 1.2 for world map
    zoom: 10.75
})

// Create geocoder as a variable
const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl
});

// Append geocoder variable to geocoder HTML div to position on page
document.getElementById("geocoder").appendChild(geocoder.onAdd(map));

// Add navigation and fullscreen controls
map.addControl(new mapboxgl.NavigationControl());
map.addControl(new mapboxgl.FullscreenControl());
map.scrollZoom.enable();
map.boxZoom.enable();
map.dragPan.enable();
map.dragRotate.enable();
map.keyboard.enable();
map.doubleClickZoom.enable();
map.touchZoomRotate.enable();


// add data source when it first loads onto the screen
map.on('load', () => {
    map.addSource('proj-data', {
        type: 'geojson', 
        // geojson file in folder -- with github, can directly link to this line, not raw file
        data: 'USI_projects.geojson'
    })

    // new map layer for toronto basemap -- only at specific zoom levels
    map.addLayer({
        id: 'toronto-basemap',
        type: 'fill',
        source: {
            type: 'geojson',
            data: 'toronto_neighbourhoods.geojson'},
        paint:{
            'fill-color': ['step', ['zoom'], '#F5333F', 12.5, 'transparent'],
            'fill-opacity': 0.1
        }
    })

    // new map layer for the points from newly added data source
    map.addLayer({
        id: 'proj-points',
        type: 'circle',
        source: 'proj-data',
        // styling of the data visualization
        paint: {
            'circle-radius': 5,
            // set colour of circles based on project completion status
            'circle-color': ['match',
                ['get', 'PROJECT_END_YEAR'],
                'Ongoing', '#FFFF00',
                'N/A', '#000000',
                /* other */ '#008000'
            ],
            // set colour and width of circle borders
            'circle-stroke-color': '#000000',
            'circle-stroke-width': 1
        }
    })

    /* ===================================================
        Populate Client Names Datalist from GeoJSON
    ===================================================*/
    
    // Fetch the GeoJSON file and extract all unique client names
    fetch('USI_projects.geojson')
        .then(response => response.json())
        .then(data => {
            const clientNamesSet = new Set();
            
            // Extract all unique client names from features
            data.features.forEach(feature => {
                const clientNames = feature.properties.CLIENT_NAME;
                if (clientNames && Array.isArray(clientNames)) {
                    clientNames.forEach(name => {
                        if (name && name.trim()) {
                            clientNamesSet.add(name.trim());
                        }
                    });
                }
            });
            
            // Populate the datalist with unique client names
            const clientNamesDatalist = document.getElementById('clientNames');
            if (clientNamesDatalist) {
                // Clear existing options
                clientNamesDatalist.innerHTML = '';
                
                // Add options for each unique client name (sorted)
                Array.from(clientNamesSet).sort().forEach(clientName => {
                    const option = document.createElement('option');
                    option.value = clientName;
                    clientNamesDatalist.appendChild(option);
                });
                
                console.log('Populated datalist with', clientNamesSet.size, 'unique client names');
            }
        })
        .catch(error => console.error('Error loading GeoJSON for datalist:', error));

    /* ===================================================
        Attach Filter Handlers (after layer is created)
    ===================================================*/
    
    // Team Member Search
    $('.member_searchbar').select2({
        placeholder: "Search for a team member (e.g., Leigh McGrath)"
    });

    // convert selected option to text and store in activeFilters for combined filtering
    $('.member_searchbar').on('change', function() {
        var selectedMem = $('.member_searchbar option:selected').text();
        activeFilters.member = selectedMem;
        console.log('Member filter updated:', selectedMem);
        applyFilter();
    });

    // Client Name Search
    $('.client_searchbar').on('input', function() {
        var clientName = $(this).val().trim();
        activeFilters.clientName = clientName || null;
        console.log('Client filter updated:', clientName);
        console.log('Active filters:', activeFilters);
        applyFilter();
    });

    // Project Number Search
    $('.project_number_input').on('input', function() {
        var projectNumber = $(this).val().trim();
        activeFilters.projectNumber = projectNumber || null;
        console.log('Project number filter:', projectNumber);
        applyFilter();
    });
    // Add project number filter if active (updated for partial matches)
    if (activeFilters.projectNumber) {
        // Escape special regex characters in the input
        const escaped = activeFilters.projectNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Use match expression: if the project number contains the input as a substring, include it
        filters.push(['==', ['match', ['to-string', ['get', 'PROJECT_NUMBER']], new RegExp('.*' + escaped + '.*'), true, false], true]);
    }    

    // Project Type Filter and combine with other filters
    const getProjType = document.getElementById('proj_type');
    if (getProjType) {
        getProjType.addEventListener('change', (e) => {
            activeFilters.projType = e.target.value || null;
            console.log('Project type filter:', e.target.value);
            applyFilter();
        });
    }

    // Project End Year Search and combine with other filters
    $('.project_EY_input').on('input', function() {
        var projectEY = $(this).val().trim();
        activeFilters.projectEY = projectEY || null;
        console.log('Project EY filter:', projectEY);
        applyFilter();
    });

    // Project Start Year Search and combine with other filters
    $('.project_SY_input').on('input', function() {
        var projectSY = $(this).val().trim();
        activeFilters.projectSY = projectSY || null;
        console.log('Project SY filter:', projectSY);
        applyFilter();
    });

    /* =====================================
        Initialize Legend (inside load event)
    ======================================*/
    
    // create legend variable and dictionary for labels and colours
    const legend = document.getElementById('legend');
    const legendLabels = [
        {label: 'Ongoing Projects', color: '#FFFF00', borderColor: '#000000', borderWidth: '1px'},
        {label: 'Completed Projects', color: '#008000', borderColor: '#000000', borderWidth: '1px'},
        {label: 'N/A End Year', color: '#000000', borderColor: '#000000', borderWidth: '1px'}
    ];

    // loop through labels and create legend items for each
    legendLabels.forEach((item) => {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';

        const circle = document.createElement('div');
        circle.className = 'legend-circle';
        circle.style.backgroundColor = item.color;
        circle.style.width = '14px';
        circle.style.height = '14px';
        circle.style.display = 'inline-block';
        circle.style.marginRight = '8px';
        circle.style.verticalAlign = 'middle';
        circle.style.border = item.borderWidth + ' solid ' + item.borderColor;
        
        const label = document.createElement('span');
        label.textContent = item.label;

        // add items to legend
        legendItem.appendChild(circle);
        legendItem.appendChild(label);
        legend.appendChild(legendItem);
    });

    /* =====================================
        Mouse Events (inside load event)
    ======================================*/

    // When mouse enters a point
    map.on("mouseenter", "proj-points", () => {
        map.getCanvas().style.cursor = "pointer";
    });

    // When mouse leaves a point
    map.on("mouseleave", "proj-points", () => {
        map.getCanvas().style.cursor = "";
        // Remove hover popup when mouse leaves
        const existingPopups = document.querySelectorAll('.mapboxgl-popup');
        existingPopups.forEach(popup => popup.remove());
    });

    // Hover popup - show on mousemove
    map.on('mousemove', 'proj-points', (e) => {
        const coordinates = e.features[0].geometry.coordinates;
        const properties = e.features[0].properties;
        
        // create dynamic description for popup
        const description = `
          <div>
            <h3><b>${properties.PROJECT_NAME}</b></h3>
            <p><strong><b>Project Number:</b></strong> ${properties.PROJECT_NUMBER}</p>
            <p><strong><b>Address:</b></strong> ${properties.ADDRESS}</p>
          </div>
        `;

        // Remove existing popups before creating new one
        const existingPopups = document.querySelectorAll('.mapboxgl-popup');
        existingPopups.forEach(popup => popup.remove());

        // create the popup at hovered point
        new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(description)
            .addTo(map);
    });
    
    map.on('click', 'proj-points', (e) => {
        const coordinates = e.features[0].geometry.coordinates;
        const properties = e.features[0].properties;

        // create dynamic desccription for popup
        const description = `
          <div>
            <h3>${properties.PROJECT_NAME}</h3>
            <p><strong>Project Number:</strong> ${properties.PROJECT_NUMBER}</p>
            <p><strong>Address:</strong> ${properties.ADDRESS}</p>
          </div>
        `;

        // Zoom into the clicked point
        map.flyTo({
            center: coordinates,
            zoom: 15,
            essential: true
        });

        // dynamically populate project info panel (bottom right) with relevant project info
        const projInfoDiv = document.getElementById('proj_data');
        if (projInfoDiv) {
            projInfoDiv.innerHTML = '';

            const projname = `<p class="proj-name">${properties.PROJECT_NAME || 'N/A'}</p>`;
            const projnum = `<p><span class="label">Project Number:</span> ${properties.PROJECT_NUMBER || 'N/A'}</p>`;
            const address = `<p><span class="label">Address:</span> ${properties.ADDRESS || 'N/A'}</p>`;
            
            // Helper function to safely convert arrays/strings to comma-separated text
            const toText = (val) => {
                console.log('toText input:', val, typeof val);
                if (!val) return 'N/A';
                
                // If it's a string that looks like JSON array, parse it
                if (typeof val === 'string') {
                    const trimmed = val.trim();
                    if (trimmed.startsWith('[')) {
                        try {
                            const parsed = JSON.parse(trimmed);
                            if (Array.isArray(parsed)) {
                                return parsed.filter(v => v && v.toString().trim()).join(', ');
                            }
                        } catch (e) {
                            console.warn('Failed to parse JSON:', trimmed, e);
                        }
                    }
                    // Not JSON, just return the string
                    return trimmed || 'N/A';
                }
                
                // If it's already an array, join it
                if (Array.isArray(val)) {
                    return val.filter(v => v && v.toString().trim()).join(', ');
                }
                
                return String(val);
            };
            
            // process possible array fields into text for clean presentation
            const projtype = toText(properties['PROJECT_TYPE']);
            const cliName = toText(properties['CLIENT_NAME']);
            const cliType = toText(properties['CLIENT_TYPE']);
            const USIteam = toText(properties['USI_TEAM_MEMBERS']);
            const bylawnum = toText(properties['BY_LAW_NUM']);
            
            // debug in DevTools console (F12)
            console.log('projtype:', projtype);
            console.log('cliName:', cliName);
            console.log('cliType:', cliType);
            console.log('USIteam:', USIteam);
            console.log('bylawnum:', bylawnum);
            
            // create HTML segments for each field
            const PROJTYPE = `<p><span class="label">Project Type:</span> ${projtype}</p>`
            const clientName = `<p><span class="label">Client Name(s):</span> ${cliName}</p>`
            const clientType = `<p><span class="label">Client Type:</span> ${cliType}</p>`
            const usiteam = `<p><span class="label">USI Team Members:</span> ${USIteam}</p>`
            const bylaw = `<p><span class="label">By-law Number(s):</span> ${bylawnum}</p>`

            // insert info into div and make visible
            projInfoDiv.innerHTML = projname + projnum + address + PROJTYPE + clientName + clientType + usiteam + bylaw;
            projInfoDiv.style.display = 'block';
            projInfoDiv.classList.add('visible');
            
            // Hide legend when a project is selected
            const legendEl = document.getElementById('legend');
            if (legendEl) {
                legendEl.style.display = 'none';
            }
        }
    });

    // Hide the project info panel when clicking on the map but not on a project point
    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['proj-points'] });
        if (!features || features.length === 0) {
            const projInfoDiv = document.getElementById('proj_data');
            if (projInfoDiv) {
                projInfoDiv.style.display = 'none';
                projInfoDiv.classList.remove('visible');
                projInfoDiv.innerHTML = '';
            }
            // Show legend when no project is selected
            const legendEl = document.getElementById('legend');
            if (legendEl) {
                legendEl.style.display = 'block';
            }
        }
    });
});

/* ==================================
    BUTTON: RETURN TO FULL EXTENT
======================================*/

// create button to respond to click event
document.getElementById('returnbutton').addEventListener('click', () => {
    // fly back to full extent and center coordinates    
    map.jumpTo({
        center: [-79.357577, 43.721446], 
        zoom: 10.75,
        essential: true
    });
    
    // Close any open popups
    const popups = document.querySelectorAll('.mapboxgl-popup');
    popups.forEach(popup => popup.remove());
    
    // Reset all filter values
    activeFilters.member = null;
    activeFilters.projectNumber = null;
    activeFilters.projType = null;
    activeFilters.projectEY = null;
    activeFilters.projectSY = null;
    activeFilters.clientName = null;
    console.log('Active filters reset:', activeFilters);
    
    // Clear form inputs (without triggering events to avoid recursive calls)
    const select = document.querySelector('.member_searchbar');
    if (select) {
        // Clear Select2 without triggering change event
        $(select).val('').trigger('change.select2');
    }
    
    const clientSelect = document.querySelector('.client_searchbar');
    if (clientSelect) {
        clientSelect.value = '';
    }
    
    const projTypeEl = document.getElementById('proj_type');
    if (projTypeEl) {
        projTypeEl.value = '';
    }
    
    const projNumInput = document.querySelector('.project_number_input');
    if (projNumInput) {
        projNumInput.value = '';
    }
    
    const projEYInput = document.querySelector('.project_EY_input');
    if (projEYInput) {
        projEYInput.value = '';
    }

    const projSYInput = document.querySelector('.project_SY_input');
    if (projSYInput) {
        projSYInput.value = '';
    }
    
    // Apply filter to show all points
    applyFilter();
    
    // Hide the project info panel
    const projInfoDiv = document.getElementById('proj_data');
    if (projInfoDiv) {
        projInfoDiv.style.display = 'none';
        projInfoDiv.classList.remove('visible');
        projInfoDiv.innerHTML = '';
    }
    
    // Show the legend
    const legendEl = document.getElementById('legend');
    if (legendEl) {
        legendEl.style.display = 'block';
    }
});

/* ==========================================
    Combine filters to narrow down results
=============================================*/

// Store active filter values
let activeFilters = {
    member: null,
    projectNumber: null,
    projType: null,
    projectEY: null,
    projectSY: null,
    clientName: null
};

// Build combined filter from all active filters
function buildCombinedFilter() {
    const filters = [];
    
    // Add member filter if active
    // Check if the selected member value appears in the USI_TEAM_MEMBERS array
    if (activeFilters.member && activeFilters.member !== 'All') {
        filters.push(['in', activeFilters.member, ['get', 'USI_TEAM_MEMBERS']]);
    }
    
    // Add client name filter if active
    // Check if the selected client name appears in the CLIENT_NAME array
    if (activeFilters.clientName && activeFilters.clientName !== 'All') {
        filters.push(['in', activeFilters.clientName, ['get', 'CLIENT_NAME']]);
    }

    // Add project number filter if active (partial matching)
    if (activeFilters.projectNumber) {
        filters.push(['>=', ['index-of', activeFilters.projectNumber, ['to-string', ['get', 'PROJECT_NUMBER']]], 0]);
    }
    
    // Add project type filter if active
    // Check if the selected type appears in the PROJECT_TYPE array
    if (activeFilters.projType && activeFilters.projType !== 'All') {
        filters.push(['in', activeFilters.projType, ['get', 'PROJECT_TYPE']]);
    }
    
    // Add project end year filter if active
    if (activeFilters.projectEY) {
        filters.push(['==', ['get', 'PROJECT_END_YEAR'], activeFilters.projectEY]);
    }
    
    // Add project start year filter if active
    if (activeFilters.projectSY) {
        filters.push(['==', ['get', 'PROJECT_START_YEAR'], activeFilters.projectSY]);
    }

    // If no filters, return null (show all)
    if (filters.length === 0) {
        return null;
    }
    
    // If one filter, return it directly
    if (filters.length === 1) {
        return filters[0];
    }
    
    // If multiple filters, combine with 'all' (AND logic)
    return ['all', ...filters];
}

// Apply the combined filter to the map
function applyFilter() {
    const combinedFilter = buildCombinedFilter();
    console.log('Applying combined filter:', combinedFilter);
    
    try {
        // Use null to show all features, or the filter expression
        if (combinedFilter === null) {
            map.setFilter('proj-points', null);
            console.log('Filter set to null - showing all points');
        } else {
            map.setFilter('proj-points', combinedFilter);
            console.log('Filter applied successfully');
        }
    } catch (error) {
        console.error('Error applying filter:', error);
        console.error('Filter expression was:', combinedFilter);
        // Reset to show all points if there's an error
        map.setFilter('proj-points', null);
    }
}
