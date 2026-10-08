cmake_minimum_required(VERSION 3.15)
project(crypto_crow_api CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Diretórios do Homebrew no macOS
if(APPLE)
    include_directories(/opt/homebrew/include)
    link_directories(/opt/homebrew/lib)
endif()

find_package(Crow QUIET)
find_package(cpr QUIET)
find_package(Matplot++ QUIET)

add_executable(server crowStarter.cpp getValue.cpp)

if(TARGET Crow::Crow)
    target_link_libraries(server PRIVATE Crow::Crow)
endif()

if(TARGET cpr::cpr)
    target_link_libraries(server PRIVATE cpr::cpr)
else()
    target_link_libraries(server PRIVATE cpr)
endif()

if(TARGET Matplot++::matplot)
    target_link_libraries(server PRIVATE Matplot++::matplot)
else()
    target_link_libraries(server PRIVATE matplot)
endif()
